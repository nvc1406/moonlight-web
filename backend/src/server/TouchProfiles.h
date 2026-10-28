#pragma once

#include <QJsonObject>
#include <QString>

// Versioned, atomically persisted owner-authored profiles. Runtime selection
// belongs to a host session; an individual browser chooses its own profile.
class TouchProfiles
{
public:
    explicit TouchProfiles(QString path);
    QJsonObject document() const { return m_Document; }
    bool replace(const QJsonObject& document, QString& error);
    QJsonObject game(const QString& host, int app) const;
    QJsonObject profile(const QString& host, int app, const QString& mode,
                        const QString& preferred = {}) const;
    void selectGame(const QString& host, int app, int sourceApp = -1)
    {
        m_Selected[host] = QJsonObject{{"appId", app}, {"sourceApp", sourceApp}};
    }
    int selectedApp(const QString& host, int fallback) const;
    bool contains(const QString& host, int app, const QString& mode, const QString& profile) const;
    static bool validate(const QJsonObject& document, QString& error);

private:
    QString m_Path;
    QJsonObject m_Document;
    QJsonObject m_Selected;
};
