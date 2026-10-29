#include "TouchRoutes.h"
#include "server/HttpServer.h"
#include "server/RestRouter.h"
#include <QDateTime>
#include <QJsonArray>
#include <QJsonDocument>
#include <QUuid>
#include <memory>

namespace {
struct VoicePeer
{
    QString room;
    int slot = -1;
    QString activation;
    qint64 seen = 0;
    QJsonArray inbox;
    qint64 rateAt = 0;
    int sent = 0;
};
struct VoiceRoom
{
    QHash<QString, VoicePeer> peers;
};
} // namespace

void registerTouchRoutes(HttpServer& server, TouchProfiles& profiles, ShareManager& share,
                         const ShareRoutesDeps& deps)
{
    auto slotOf = [&share](const HttpRequest& req) {
        return share.slotForCookie(HttpServer::cookieFromRequest(req, ShareManager::kPlayerCookie));
    };
    auto context = [&server, &deps, &share,
                    slotOf](const HttpRequest& req) -> std::pair<QString, int> {
        const int slot = slotOf(req);
        if (slot >= 0) {
            if (!share.isStreaming(slot)) return {};
            const auto owner = deps.currentOwnerContext();
            const auto host = share.hostForSlot(slot);
            return {host, owner.first == host ? owner.second : share.appForSlot(slot)};
        }
        if (req.isLocal || server.isAuthenticated(req)) return deps.currentOwnerContext();
        return {};
    };
    server.router()->get("/api/touch/capabilities", [&server, &deps](const HttpRequest& req) {
        if (!req.isLocal && !server.isAuthenticated(req))
            return HttpResponse::error(401, "Authentication required");
        return HttpResponse::json(QJsonObject{{"gamepadMode", deps.guestController &&
            deps.guestController(req.queryParams.value("host"))}});
    });
    // Paired library clients may read a game's layouts without receiving admin
    // privileges or the full editable profile document. Invitation guests keep
    // using /player/touch/session, scoped to their authorized seat.
    server.router()->get("/api/touch/game", [&server, &profiles, &deps](const HttpRequest& req) {
        if (!req.isLocal && !server.isAuthenticated(req))
            return HttpResponse::error(401, "Authentication required");
        const QString host = req.queryParams.value("host");
        bool appOk = false;
        const int app = req.queryParams.value("appId").toInt(&appOk);
        if (!appOk || app < 0 || !deps.hostAppExists || !deps.hostAppExists(host, app))
            return HttpResponse::error(404, "Game not found");
        return HttpResponse::json(profiles.game(host, profiles.selectedApp(host, app)));
    });
    server.router()->get("/api/touch/profiles", [&profiles](const HttpRequest& req) {
        if (!req.isLocal) return HttpResponse::error(403, "Owner only");
        return HttpResponse::json(profiles.document());
    });
    server.router()->post("/api/touch/profiles", [&profiles](const HttpRequest& req) {
        if (!req.isLocal) return HttpResponse::error(403, "Owner only");
        if (req.body.size() > 2 * 1024 * 1024)
            return HttpResponse::error(413, "Profiles too large");
        const auto doc = QJsonDocument::fromJson(req.body).object();
        if (doc["revision"].toInt(-1) != profiles.document()["revision"].toInt())
            return HttpResponse::error(409, "Profiles changed; reload before saving");
        QString error;
        if (!profiles.replace(doc, error)) return HttpResponse::error(400, error);
        return HttpResponse::json(profiles.document());
    });
    auto info = [&profiles, &deps, context](const HttpRequest& req) {
        auto target = context(req);
        if (target.first.isEmpty()) return HttpResponse::error(403, "No active session");
        const int app = profiles.selectedApp(target.first, target.second);
        QJsonObject obj{{"game", profiles.game(target.first, app)},
                        {"revision", profiles.document()["revision"]},
                        {"owner", req.isLocal}};
        obj["capabilities"] =
            QJsonObject{{"gamepadMode", deps.guestController && deps.guestController(target.first)},
                        {"voice", true}};
        return HttpResponse::json(obj);
    };
    server.router()->get("/api/share/player/touch/session", info);
    server.router()->post(
        "/api/share/player/touch/session", [&profiles, &deps, info](const HttpRequest& req) {
            if (!req.isLocal) return HttpResponse::error(403, "Owner only");
            const auto target = deps.currentOwnerContext();
            if (target.first.isEmpty()) return HttpResponse::error(409, "No active session");
            const auto body = QJsonDocument::fromJson(req.body).object();
            const int app = body["appId"].toInt(-1);
            if (app < 0 || (deps.hostAppExists && !deps.hostAppExists(target.first, app)))
                return HttpResponse::error(400, "Unknown game on this host");
            profiles.selectGame(target.first, app, target.second);
            return info(req);
        });

    // Signaling only: audio remains end-to-end WebRTC between browsers.
    // Polls refresh presence, and every request revalidates the activation.
    auto room = std::make_shared<VoiceRoom>();
    server.router()->post("/api/share/player/touch/voice", [room, context, slotOf,
                                                            &share](const HttpRequest& req) {
        const auto target = context(req);
        if (target.first.isEmpty()) return HttpResponse::error(403, "No active session");
        if (req.body.size() > 65536) return HttpResponse::error(413, "Signal too large");
        const int slot = slotOf(req);
        const QString activation =
            slot >= 0 ? HttpServer::cookieFromRequest(req, ShareManager::kPlayerCookie) : QString();
        const qint64 now = QDateTime::currentMSecsSinceEpoch();
        for (auto it = room->peers.begin(); it != room->peers.end();) {
            if (now - it->seen > 15000 ||
                (it->slot >= 0 && share.slotForCookie(it->activation) != it->slot))
                it = room->peers.erase(it);
            else
                ++it;
        }
        const auto body = QJsonDocument::fromJson(req.body).object();
        QString id = body["peer"].toString();
        if (id.isEmpty()) {
            // One voice peer per authorized seat; reconnect retires the old peer.
            for (auto it = room->peers.begin(); it != room->peers.end();) {
                if (it->room == target.first && it->slot == slot)
                    it = room->peers.erase(it);
                else
                    ++it;
            }
            id = QUuid::createUuid().toString(QUuid::WithoutBraces);
            room->peers.insert(id, VoicePeer{target.first, slot, activation, now, {}, now, 0});
        }
        auto self = room->peers.find(id);
        if (self == room->peers.end() || self->room != target.first || self->slot != slot ||
            self->activation != activation)
            return HttpResponse::error(403, "Unknown voice peer");
        if (body["leave"].toBool()) {
            room->peers.erase(self);
            return HttpResponse::json(QJsonObject{});
        }
        self->seen = now;
        const auto recipient = body["to"].toString();
        if (!recipient.isEmpty()) {
            if (now - self->rateAt >= 1000) {
                self->rateAt = now;
                self->sent = 0;
            }
            if (++self->sent > 80) return HttpResponse::error(429, "Too many voice signals");
            auto other = room->peers.find(recipient);
            if (other == room->peers.end() || other->room != target.first ||
                other->inbox.size() >= 128)
                return HttpResponse::error(409, "Voice peer unavailable");
            const auto signal = body["signal"].toObject();
            if (!signal.contains("description") && !signal.contains("candidate"))
                return HttpResponse::error(400, "Invalid signal");
            other->inbox.append(QJsonObject{{"from", id}, {"signal", signal}});
        }
        QJsonArray peers;
        for (auto it = room->peers.cbegin(); it != room->peers.cend(); ++it)
            if (it.key() != id && it->room == target.first) peers.append(it.key());
        const auto messages = self->inbox;
        self->inbox = {};
        return HttpResponse::json(
            QJsonObject{{"peer", id}, {"peers", peers}, {"messages", messages}});
    });
}
