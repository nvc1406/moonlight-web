#include "test_framework.h"
#include "server/TouchProfiles.h"
#include <QJsonArray>
#include <QTemporaryDir>

void run_touch_profiles_tests()
{
    SECTION("touch profiles: game/mode ownership, validation and atomic persistence");
    QTemporaryDir dir;
    const auto path = dir.filePath("profiles.json");
    TouchProfiles store(path);
    QJsonObject profile{
        {"id", "video"},
        {"name", "Video"},
        {"audio", true},
        {"deadzone", .12},
        {"sensitivity", 1},
        {"opacity", .6},
        {"layouts", QJsonObject{{"landscape", QJsonArray{}}, {"portrait", QJsonArray{}}}}};
    QJsonObject group{{"defaultProfileId", "video"}, {"profiles", QJsonArray{profile}}};
    QJsonObject game{{"host", "pc"},
                     {"appId", 42},
                     {"name", "Game"},
                     {"modes", QJsonObject{{"stream", group},
                                           {"gamepad", QJsonObject{{"defaultProfileId", ""},
                                                                   {"profiles", QJsonArray{}}}}}}};
    auto doc = store.document();
    doc["games"] = QJsonArray{game};
    QString error;
    CHECK(store.replace(doc, error));
    CHECK_EQ(store.document()["revision"].toInt(), 1);
    CHECK(store.contains("pc", 42, "stream", "video"));
    CHECK(!store.contains("other", 42, "stream", "video"));
    CHECK(!store.contains("pc", 43, "stream", "video"));
    CHECK(!store.contains("pc", 42, "gamepad", "video"));
    CHECK(store.contains("pc", 42, "gamepad", "builtin"));
    CHECK(!store.contains("pc", 42, "stream", "builtin"));
    CHECK(store.profile("pc", 42, "stream")["audio"].toBool());
    CHECK(!store.profile("pc", 42, "gamepad")["audio"].toBool());
    CHECK_EQ(store.profile("pc", 42, "stream", "deleted")["id"].toString(), QString("video"));
    CHECK(!store.contains("pc", 42, "invalid", ""));
    CHECK(!store.replace(doc, error)); // stale editor cannot overwrite another save
    TouchProfiles restored(path);
    CHECK_EQ(restored.document(), store.document());
    CHECK_EQ(restored.selectedApp("pc", 42), 42);
    restored.selectGame("pc", 43);
    CHECK_EQ(restored.selectedApp("pc", 42), 43);
    restored.selectGame("pc", 43, 42);
    CHECK_EQ(restored.selectedApp("pc", 42), 43);
    CHECK_EQ(restored.selectedApp("pc", 99), 99);
    auto invalid = store.document();
    auto bad = game;
    auto modes = bad["modes"].toObject();
    auto broken = group;
    broken["defaultProfileId"] = "deleted";
    modes["stream"] = broken;
    bad["modes"] = modes;
    invalid["games"] = QJsonArray{bad};
    CHECK(!store.replace(invalid, error));
    CHECK_EQ(store.document()["revision"].toInt(), 1);
    invalid = store.document();
    invalid["games"] = QJsonArray{game, game};
    CHECK(!store.replace(invalid, error));
    auto negative = profile;
    negative["deadzone"] = 1;
    broken = group;
    broken["profiles"] = QJsonArray{negative};
    modes["stream"] = broken;
    bad["modes"] = modes;
    invalid["games"] = QJsonArray{bad};
    CHECK(!store.replace(invalid, error));
    invalid = store.document();
    invalid["games"] = QJsonArray{};
    CHECK(store.replace(invalid, error));
    CHECK(store.contains("pc", 42, "stream", "builtin"));
}
