/*
 * MoonlightWeb — browser-based Sunshine/GameStream client.
 * Copyright (C) 2026 Bruno Martin <brunoocto@gmail.com>
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with
 * this program. If not, see <https://www.gnu.org/licenses/>.
 */

#include "server/routes/HostAppRoutes.h"

#include "backend/VirtualDisplay.h"
#include "backend/streambackend/NativeHostBackend.h"
#include "common/Logger.h"
#include "server/AppSettings.h"
#include "server/HostAppImage.h"
#include "server/HttpServer.h"
#include "server/LauncherDetect.h"
#include "server/RestRouter.h"

#include <QCoreApplication>
#include <QBuffer>
#include <QDir>
#include <QFileInfo>
#include <QStandardPaths>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

namespace {

HttpResponse adminOnly()
{
    return HttpResponse::error(403, "The host's apps can only be changed by its administrator");
}

/// The image of a launcher's card: its program's icon on a dark card. Its
/// hash, or empty when the program has no icon to read.
QString storeLauncherImage(AppSettings& appSettings, const QString& id, const QString& iconPath)
{
    const QImage icon = HostAppImage::iconOf(iconPath);
    if (icon.isNull()) return QString();
    QString why;
    const QString hash = HostAppImage::store(appSettings.hostAppImagesDir(), id,
                                             HostAppImage::cardFromIcon(icon), &why);
    if (hash.isEmpty())
        Logger::warning(QStringLiteral("[HostApp] no image for %1: %2").arg(iconPath, why));
    else
        appSettings.setHostAppImage(id, hash);
    return hash;
}

const LauncherDetect::Launcher* launcherOf(const QVector<LauncherDetect::Launcher>& found,
                                           const QString& source)
{
    for (const LauncherDetect::Launcher& launcher : found)
        if (launcher.source == source) return &launcher;
    return nullptr;
}

QJsonObject listJson(AppSettings& appSettings)
{
    QJsonObject obj;
    // Wherever the native host can stream: the apps open on its screen.
    obj["supported"] = NativeHostBackend::isEnabled() &&
                       (NativeHostBackend::isAvailable() || VirtualDisplay::probe().installed);
    obj["max"] = AppSettings::kHostAppsMax;
    obj["screen"] = NativeHostBackend::toString(NativeHostBackend::hostAppScreen());
    const QJsonArray apps = appSettings.hostApps();
    obj["apps"] = apps;
    // The launchers found on this PC whose card the owner removed: the page
    // offers them back.
    const QStringList dismissed = appSettings.hostAppsDismissed();
    QJsonArray detected;
    for (const LauncherDetect::Launcher& launcher : LauncherDetect::detect()) {
        bool listed = false;
        for (const QJsonValue& v : apps)
            if (v.toObject().value("source").toString() == launcher.source) listed = true;
        detected.append(QJsonObject{{"source", launcher.source},
                                    {"name", launcher.name},
                                    {"listed", listed},
                                    {"dismissed", dismissed.contains(launcher.source)}});
    }
    obj["detected"] = detected;
    return obj;
}

} // namespace

void seedDetectedLaunchers(AppSettings& appSettings)
{
    const QVector<LauncherDetect::Launcher> found = LauncherDetect::detect();
    QJsonArray added;
    if (!appSettings.seedHostApps(LauncherDetect::toJson(found),
                                  QCoreApplication::applicationVersion(), &added))
        return;
    for (const QJsonValue& v : added) {
        const QJsonObject entry = v.toObject();
        const LauncherDetect::Launcher* launcher =
            launcherOf(found, entry.value("source").toString());
        if (launcher)
            storeLauncherImage(appSettings, entry.value("id").toString(), launcher->iconPath);
        Logger::info(QStringLiteral("[HostApp] found on this PC: %1 — its card is on the host")
                         .arg(entry.value("name").toString()));
    }
}

void registerHostAppRoutes(HttpServer& server, AppSettings& appSettings)
{
    server.router()->get("/api/host-apps", [&appSettings](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        return HttpResponse::json(listJson(appSettings));
    });

    // Browse the host filesystem, never the browser client's upload directory.
    // This endpoint shares the same administrator guard as app configuration.
    server.router()->post("/api/host-apps/browse", [](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QString path = QJsonDocument::fromJson(req.body).object()["path"].toString();
        if (path.isEmpty()) {
            QJsonArray entries;
            QStringList roots{QDir::homePath(),
                QStandardPaths::writableLocation(QStandardPaths::DesktopLocation)};
            for (const QFileInfo& drive : QDir::drives()) roots.append(drive.absoluteFilePath());
#ifdef Q_OS_WIN
            roots.append(qEnvironmentVariable("ProgramFiles"));
            roots.append(qEnvironmentVariable("ProgramFiles(x86)"));
            roots.append(qEnvironmentVariable("LOCALAPPDATA") + QStringLiteral("/Programs"));
#endif
            roots.removeDuplicates();
            for (const QString& root : roots) {
                if (root.isEmpty() || !QFileInfo(root).isDir()) continue;
                entries.append(QJsonObject{{"name", QDir::toNativeSeparators(root)},
                                            {"path", root}, {"directory", true}});
            }
            return HttpResponse::json(QJsonObject{{"path", ""}, {"parent", ""},
                                                  {"entries", entries}});
        }
        const QFileInfo target(path);
        if (!target.isAbsolute() || !target.isDir() || !target.isReadable())
            return HttpResponse::error(400, "Choose a readable folder on the host PC");
        const QDir dir(target.canonicalFilePath());
        QJsonArray entries;
        for (const QFileInfo& file : dir.entryInfoList(QDir::Dirs | QDir::Files | QDir::NoDotAndDotDot,
                                                       QDir::DirsFirst | QDir::Name | QDir::IgnoreCase)) {
#ifdef Q_OS_WIN
            const bool program = file.suffix().compare("exe", Qt::CaseInsensitive) == 0;
#else
            const bool program = file.isExecutable() || file.suffix() == "app";
#endif
            if (!file.isDir() && !program) continue;
            entries.append(QJsonObject{{"name", file.fileName()}, {"path", file.absoluteFilePath()},
                                        {"directory", file.isDir()}});
        }
        QDir parent = dir;
        parent.cdUp();
        return HttpResponse::json(QJsonObject{{"path", dir.absolutePath()},
            {"parent", parent.absolutePath()}, {"entries", entries}});
    });
    server.router()->post("/api/host-apps/inspect", [](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QFileInfo file(QJsonDocument::fromJson(req.body).object()["path"].toString());
#ifdef Q_OS_WIN
        const bool program = file.isFile() && file.suffix().compare("exe", Qt::CaseInsensitive) == 0;
#else
        const bool program = (file.isFile() && file.isExecutable()) ||
                             (file.isDir() && file.suffix() == "app");
#endif
        if (!file.isAbsolute() || !file.exists() || !file.isReadable() || !program)
            return HttpResponse::error(400, "Choose an executable on the host PC");
        const QString path = QDir::toNativeSeparators(file.canonicalFilePath());
        QJsonObject result{{"name", file.completeBaseName().left(40)},
                            {"command", QStringLiteral("\"%1\"").arg(path)}};
        const QImage icon = HostAppImage::iconOf(path);
        if (!icon.isNull()) {
            QByteArray png;
            QBuffer buffer(&png);
            buffer.open(QIODevice::WriteOnly);
            HostAppImage::cardFromIcon(icon).save(&buffer, "PNG");
            result["png"] = QString::fromLatin1(png.toBase64());
        }
        return HttpResponse::json(result);
    });

    server.router()->post("/api/host-apps", [&appSettings](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QJsonObject body = QJsonDocument::fromJson(req.body).object();
        if (!body.value("apps").isArray()) return HttpResponse::error(400, "apps must be a list");
        QString why;
        QStringList removed;
        if (!appSettings.setHostApps(body.value("apps").toArray(), &why, &removed))
            return HttpResponse::error(400, why);
        for (const QString& id : removed)
            HostAppImage::remove(appSettings.hostAppImagesDir(), id);
        return HttpResponse::json(listJson(appSettings));
    });

    server.router()->post("/api/host-apps/restore", [&appSettings](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QString source =
            QJsonDocument::fromJson(req.body).object().value("source").toString();
        const QVector<LauncherDetect::Launcher> found = LauncherDetect::detect();
        const LauncherDetect::Launcher* launcher = launcherOf(found, source);
        if (!launcher) return HttpResponse::error(404, "That launcher is not on this PC");
        QString why;
        const QJsonObject entry =
            appSettings.restoreHostApp(LauncherDetect::toJson(*launcher), &why);
        if (entry.isEmpty()) return HttpResponse::error(400, why);
        storeLauncherImage(appSettings, entry.value("id").toString(), launcher->iconPath);
        return HttpResponse::json(listJson(appSettings));
    });

    server.router()->post("/api/host-apps/:id/image", [&appSettings](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QString id = req.pathParams.value("id");
        bool known = false;
        for (const QJsonValue& v : appSettings.hostApps())
            if (v.toObject().value("id").toString() == id) known = true;
        if (!known) return HttpResponse::error(404, "No such app");
        const QByteArray png = QByteArray::fromBase64(
            QJsonDocument::fromJson(req.body).object().value("png").toString().toLatin1());
        QImage image;
        QString why;
        if (!HostAppImage::decodeUpload(png, &image, &why)) return HttpResponse::error(400, why);
        const QString hash = HostAppImage::store(appSettings.hostAppImagesDir(), id,
                                                 HostAppImage::cardFrom(image), &why);
        if (hash.isEmpty()) return HttpResponse::error(500, why);
        appSettings.setHostAppImage(id, hash);
        return HttpResponse::json(listJson(appSettings));
    });

    server.router()->del("/api/host-apps/:id/image", [&appSettings](const HttpRequest& req) {
        if (!req.isLocal) return adminOnly();
        const QString id = req.pathParams.value("id");
        if (!appSettings.setHostAppImage(id, QString()))
            return HttpResponse::error(404, "No such app");
        HostAppImage::remove(appSettings.hostAppImagesDir(), id);
        return HttpResponse::json(listJson(appSettings));
    });
}
