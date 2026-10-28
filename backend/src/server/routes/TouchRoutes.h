#pragma once
#include "ShareRoutes.h"
#include "server/TouchProfiles.h"

void registerTouchRoutes(HttpServer& server, TouchProfiles& profiles, ShareManager& share,
                         const ShareRoutesDeps& deps);
