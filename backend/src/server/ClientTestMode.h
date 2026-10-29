#pragma once

#include "common/Types.h"

// A separate URL/cookie namespace lets the host browser exercise real client
// authentication without reading, replacing or expiring its admin session.
namespace ClientTestMode {
inline void prepare(HttpRequest& req)
{
    if (req.testClient || !req.path.startsWith(QLatin1String("/client-test/"))) return;
    req.testClient = true;
    req.path.remove(0, QStringLiteral("/client-test").size());
    QStringList cookies;
    for (const QString& raw : req.headers.value("cookie").split(';')) {
        const QString cookie = raw.trimmed();
        const QString name = cookie.section('=', 0, 0);
        if (name.compare("mw_session", Qt::CaseInsensitive) == 0) continue;
        if (name.compare("mw_test_client_session", Qt::CaseInsensitive) == 0)
            cookies.append("mw_session=" + cookie.section('=', 1));
        else if (!cookie.isEmpty()) cookies.append(cookie);
    }
    req.headers["cookie"] = cookies.join("; ");
}

inline HttpResponse response(HttpResponse resp)
{
    for (auto it = resp.headers.begin(); it != resp.headers.end(); ++it) {
        if (it.key().compare("Set-Cookie", Qt::CaseInsensitive) != 0) continue;
        if (!it.value().startsWith("mw_session=", Qt::CaseInsensitive)) continue;
        it.value().replace(0, QStringLiteral("mw_session").size(), "mw_test_client_session");
        it.value().replace("Path=/;", "Path=/client-test/;");
    }
    resp.headers["Cache-Control"] = "no-store";
    return resp;
}
} // namespace ClientTestMode
