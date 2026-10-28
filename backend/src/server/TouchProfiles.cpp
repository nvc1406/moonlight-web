#include "TouchProfiles.h"
#include <QDir>
#include <QFile>
#include <QFileInfo>
#include <QJsonArray>
#include <QJsonDocument>
#include <QSaveFile>
#include <QSet>
#include <cmath>
#include <utility>

TouchProfiles::TouchProfiles(QString path)
    : m_Path(std::move(path))
{
    m_Document = {{"version", 1}, {"revision", 0}, {"games", QJsonArray{}}};
    QFile file(m_Path);
    if (file.open(QIODevice::ReadOnly)) {
        const auto doc = QJsonDocument::fromJson(file.readAll()).object();
        QString error;
        if (validate(doc, error)) m_Document = doc;
    }
}

bool TouchProfiles::validate(const QJsonObject& doc, QString& error)
{
    auto fail = [&error](const QString& why) {
        error = why;
        return false;
    };
    if (doc["version"].toInt() != 1 || !doc["games"].isArray() ||
        doc["games"].toArray().size() > 256)
        return fail("Invalid profile document version or games");
    const QSet<QString> outputs{"A",  "B",    "X",    "Y",     "LB",        "RB",
                                "LT", "RT",   "L3",   "R3",    "Start",     "Back",
                                "Up", "Down", "Left", "Right", "leftStick", "rightStick"};
    QSet<QString> games;
    for (const auto& value : doc["games"].toArray()) {
        const auto game = value.toObject();
        const QString host = game["host"].toString();
        const double app = game["appId"].toDouble(-1);
        const QString key = host + ":" + QString::number(app);
        if (host.isEmpty() || host.size() > 128 || app < 0 || app != std::floor(app) ||
            app > 2147483647 || games.contains(key) || game["name"].toString().isEmpty() ||
            game["name"].toString().size() > 128)
            return fail("Invalid or duplicate game");
        games.insert(key);
        const auto modes = game["modes"].toObject();
        for (const QString mode : {QStringLiteral("stream"), QStringLiteral("gamepad")}) {
            const auto group = modes[mode].toObject();
            if (!group["profiles"].isArray() || group["profiles"].toArray().size() > 32)
                return fail("Each mode needs a profile list (maximum 32)");
            QSet<QString> ids;
            for (const auto& p : group["profiles"].toArray()) {
                const auto profile = p.toObject();
                const QString id = profile["id"].toString();
                if (id.isEmpty() || id.size() > 80 || id == "builtin" || ids.contains(id) ||
                    profile["name"].toString().isEmpty() ||
                    profile["name"].toString().size() > 80 || !profile["audio"].isBool())
                    return fail("Invalid profile identity or audio setting");
                ids.insert(id);
                for (const QString field :
                     {QStringLiteral("deadzone"), QStringLiteral("sensitivity"),
                      QStringLiteral("opacity")}) {
                    const double n = profile[field].toDouble(-1);
                    if (!std::isfinite(n) || n < (field == "sensitivity" ? 0.1 : 0) ||
                        n > (field == "sensitivity" ? 3
                             : field == "deadzone"  ? 0.9
                                                    : 1))
                        return fail("Invalid joystick or opacity setting");
                }
                for (const QString orientation :
                     {QStringLiteral("landscape"), QStringLiteral("portrait")}) {
                    const auto layout = profile["layouts"].toObject()[orientation];
                    if (!layout.isArray() || layout.toArray().size() > 32)
                        return fail("Invalid layout");
                    QSet<QString> controls;
                    for (const auto& c : layout.toArray()) {
                        const auto control = c.toObject();
                        const QString cid = control["id"].toString();
                        const QString output = control["output"].toString();
                        if (cid.isEmpty() || cid.size() > 80 || controls.contains(cid) ||
                            !outputs.contains(output) || control["label"].toString().size() > 32 ||
                            !control["hidden"].isBool())
                            return fail("Invalid control");
                        controls.insert(cid);
                        for (const QString field :
                             {QStringLiteral("x"), QStringLiteral("y"), QStringLiteral("size")}) {
                            const double n = control[field].toDouble(-1);
                            if (!std::isfinite(n) || n < (field == "size" ? 0.025 : 0) ||
                                n > (field == "size" ? 0.5 : 1))
                                return fail("Invalid layout coordinates");
                        }
                    }
                }
            }
            const auto def = group["defaultProfileId"].toString();
            if ((!ids.isEmpty() && !ids.contains(def)) || (ids.isEmpty() && !def.isEmpty()))
                return fail("Choose a replacement default profile");
        }
    }
    return true;
}

bool TouchProfiles::replace(const QJsonObject& document, QString& error)
{
    if (document["revision"].toInt(-1) != m_Document["revision"].toInt()) {
        error = "Profiles changed in another editor; reload before saving";
        return false;
    }
    if (!validate(document, error)) return false;
    auto next = document;
    next["revision"] = m_Document["revision"].toInt() + 1;
    QDir().mkpath(QFileInfo(m_Path).absolutePath());
    QSaveFile file(m_Path);
    const auto bytes = QJsonDocument(next).toJson();
    if (!file.open(QIODevice::WriteOnly) || file.write(bytes) != bytes.size() || !file.commit()) {
        error = "Could not save profiles";
        return false;
    }
    m_Document = next;
    return true;
}

int TouchProfiles::selectedApp(const QString& host, int fallback) const
{
    const auto selected = m_Selected.value(host).toObject();
    const int source = selected["sourceApp"].toInt(-1);
    return source >= 0 && source != fallback ? fallback : selected["appId"].toInt(fallback);
}

QJsonObject TouchProfiles::game(const QString& host, int app) const
{
    for (const auto& v : m_Document["games"].toArray()) {
        const auto g = v.toObject();
        if (g["host"].toString() == host && g["appId"].toInt(-1) == app) return g;
    }
    return {{"host", host}, {"appId", app}, {"name", "Xbox"}, {"modes", QJsonObject{}}};
}

QJsonObject TouchProfiles::profile(const QString& host, int app, const QString& mode,
                                  const QString& preferred) const
{
    const auto group = game(host, app)["modes"].toObject()[mode].toObject();
    const auto profiles = group["profiles"].toArray();
    QJsonObject defaultProfile;
    for (const auto& item : profiles) {
        const auto p = item.toObject();
        if (p["id"].toString() == preferred) return p;
        if (p["id"] == group["defaultProfileId"]) defaultProfile = p;
    }
    return defaultProfile.isEmpty()
               ? QJsonObject{{"id", "builtin"}, {"audio", mode == "stream"}}
               : defaultProfile;
}

bool TouchProfiles::contains(const QString& host, int app, const QString& mode,
                             const QString& profile) const
{
    if (mode != "stream" && mode != "gamepad") return false;
    const auto list = game(host, app)["modes"].toObject()[mode].toObject()["profiles"].toArray();
    if (profile.isEmpty()) return true; // the mode's default
    if (profile == "builtin") return list.isEmpty();
    for (const auto& p : list)
        if (p.toObject()["id"].toString() == profile) return true;
    return false;
}
