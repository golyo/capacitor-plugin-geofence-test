const MODULE = 'Geofence';
const EARTH_RADIUS = 6371e3; // in metres

const GEOLOCATION_THRESHOLD = 50; // in metres
const GEOLOCATION_ENABLE_HIGH_ACCURACY = true;

const NOTIFICATION_TITLE = 'You have reached the check-in zone.';
const NOTIFICATION_TEXT = 'Check-in for {airport} is now available.';
const NOTIFICATION_TIMEFENCE_TITLE = 'Check-in time is reached';
const NOTIFICATION_TIMEFENCE_TEXT = 'You are now allowed to check-in for {airport}.';
const NOTIFICATION_VIBRATION = [0];
const NOTIFICATION_ICONS_MAP = {
  ios: { smallIcon: 'res://icon/icon-small.png', icon: 'res://icon/icon.png' },
  android: { smallIcon: 'res://notification_icon', icon: 'res://notification_icon' },
};

const GEOLOCATION_CONFIG = {
  enableHighAccuracy: GEOLOCATION_ENABLE_HIGH_ACCURACY,
};

const CheckInPermission = {
  CHECK_IN_ALLOWED: 'CHECK_IN_ALLOWED',
  CHECK_IN_PENDING: 'CHECK_IN_PENDING',
  CHECK_IN_NOT_ALLOWED: 'CHECK_IN_NOT_ALLOWED',
};

const isPlatformAndroid = () => window.cordova.platformId === 'android';

const Status = {
  NONE: 'NONE',
  OK: 'OK',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  ERROR: 'ERROR',
};

const OptionHandler = (() => {
  const options = {
    notificationConfig: {
      title: NOTIFICATION_TITLE,
      text: NOTIFICATION_TEXT,
      timefenceTitle: NOTIFICATION_TIMEFENCE_TITLE,
      timefenceText: NOTIFICATION_TIMEFENCE_TEXT,
      vibration: NOTIFICATION_VIBRATION,
      icons: NOTIFICATION_ICONS_MAP[window.cordova.platformId] || {},
    },
  };

  const configure = (opts) => {
    Object.assign(options, opts);
  };

  return {
    configure,
    options,
  };
})();

const CACHE_LOCATION_MILISEC = 2000;
const PositionCache = (() => {
  let cachedPromise = null;
  let lastPosition = null;
  let lastCallTime = 0;

  const getPosition = (geolocationConfig) => {
    const now = Date.now();
    if ((now - lastCallTime) < CACHE_LOCATION_MILISEC) {
      if (cachedPromise) {
        return cachedPromise;
      }
      if (lastPosition) {
        return Promise.resolve(lastPosition);
      }
    }
    lastCallTime = now;
    cachedPromise = new Promise((resolve, reject) => {
      window.navigator.geolocation.getCurrentPosition((position) => {
        lastPosition = position;
        cachedPromise = null;
        resolve(position);
      }, (error) => {
        reject(error);
      }, geolocationConfig);
    });
    return cachedPromise;
  };

  return {
    getPosition,
  };
})();

const StatusChecker = (() => {
  let status = Status.NONE;
  let geofencingEnabled = false;

  const setStatus = (newStatus, error) => {
    const oldStatus = status;
    status = newStatus;
    if (error) {
      OptionHandler.options.logger.error(`[${MODULE}] Status change: ${oldStatus} => ${newStatus}`, error);
    } else {
      OptionHandler.options.logger.info(`[${MODULE}] Status change: ${oldStatus} => ${newStatus}`);
    }
    if (OptionHandler.options.onStatusChange && oldStatus !== newStatus) {
      OptionHandler.options.onStatusChange(newStatus, oldStatus, error);
    }
  };

  const checkLocationPermission = () => new Promise((resolve, reject) => {
    window.cordova.plugins.diagnostic.getLocationAuthorizationStatus((locStatus) => {
      resolve(locStatus);
    }, (err) => {
      reject(err);
    });
  });

  // only true if location mode enabled and gps switched on.
  const checkGps = () => new Promise((resolve, reject) => {
    if (isPlatformAndroid()) {
      window.cordova.plugins.diagnostic.isLocationAvailable(
        (available) => resolve(available),
        (err) => reject(err),
      );
    } else {
      window.cordova.plugins.diagnostic.getLocationAccuracyAuthorization(
        (accuracy) => resolve(accuracy === window.cordova.plugins.diagnostic.locationAccuracyAuthorization.FULL),
        (err) => reject(err),
      );
    }
  });

  const checkModules = () => {
    [
      { type: 'Geofence', value: window.geofence },
      { type: 'Geolocation', value: window.navigator.geolocation },
      { type: 'Diagnostic', value: window.cordova.plugins.diagnostic },
    ].forEach((module) => {
      if (!module.value) {
        throw Error(`[${module.type}] Module is missing!`);
      }
    });
  };

  const checkDeviceSettings = async () => {
    try {
      checkModules();

      const locationPermission = await checkLocationPermission();
      // On IOS the GPS can switched off only with localization service.
      const gpsEnabled = await checkGps();
      if (!gpsEnabled) {
        setStatus(Status.PERMISSION_DENIED, 'Gps or accuracy switched off, check if changed');
        return false;
      }
      geofencingEnabled = locationPermission === window.cordova.plugins.diagnostic.permissionStatus.GRANTED;
      const checkLocationEnabled = locationPermission === window.cordova.plugins.diagnostic.permissionStatus.GRANTED_WHEN_IN_USE;
      if (!geofencingEnabled && !checkLocationEnabled) {
        OptionHandler.options.logger.info(`Location permission settings denied, value is ${locationPermission}, check if changed`);
        setStatus(Status.PERMISSION_DENIED, 'Permission not granted to use geofence');
        return false;
      }
      // location check not enabled, init geofence
      if (geofencingEnabled) {
        await window.geofence.initialize();
        OptionHandler.options.logger.info('Geofencing enabled, geofence initialized');
      } else {
        OptionHandler.options.logger.info(`Geofencing disabled, value is ${locationPermission}, check if changed`);
      }
      setStatus(Status.OK);
      return true;
    } catch (error) {
      setStatus(Status.ERROR, `Error while check permisson. ${error}`);
      return false;
    }
  };

  return {
    checkDeviceSettings,
    getStatus: () => status,
    isGeofencingEnabled: () => geofencingEnabled,
  };
})();

const BannerClickHandler = (() => {
  let bannerClickEvent;

  const clearBannerClickEVent = () => {
    bannerClickEvent = undefined;
  };

  const handleBannerClickAfterInitialize = () => {
    // banner click event found and geofence initialized
    if (StatusChecker.getStatus() === Status.OK && bannerClickEvent) {
      const checkInPath = OptionHandler.options.pathPrefix + encodeURIComponent(bannerClickEvent.logicalId);
      setTimeout(clearBannerClickEVent, 1000);
      window.location.hash = checkInPath;
    }
  };

  // Called on every banner clicked, app is initialized or not
  const handleBannerClickEvent = (event) => {
    bannerClickEvent = event;
    handleBannerClickAfterInitialize();
  };

  const isBannerClickEvent = () => !!bannerClickEvent;

  return {
    handleBannerClickEvent,
    handleBannerClickAfterInitialize,
    isBannerClickEvent,
  };
})();

const MetaInformation = (() => {
  const geofencedCheckins = [];

  const getGeofenceId = (checkinInfo) => `g-${checkinInfo.logicalId}-${checkinInfo.name}`;

  const clearAll = () => {
    geofencedCheckins.length = 0;
    if (StatusChecker.isGeofencingEnabled()) {
      window.geofence.removeAll(() => {
        OptionHandler.options.logger.info(`[${MODULE}] All stored geofenced positions are cleared.`);
      }, () => {
        OptionHandler.options.logger.warn(`[${MODULE}] Already stored geofence positions could not be cleared!`);
      });
    }
  };

  const startCheckLocation = (checkinInfo) => {
    const geofenceId = getGeofenceId(checkinInfo);
    const actCheck = geofencedCheckins.find((gcheck) => (gcheck.geofenceId === geofenceId));
    if (!actCheck) {
      if (geofencedCheckins.length > 0 && geofencedCheckins[0].checkinInfo.logicalId !== checkinInfo.logicalId) {
        clearAll();
      }
      geofencedCheckins.push({
        geofenceId,
        checkinInfo,
        geofenceStarted: false,
        callbackTime: 0,
      });
    }
  };

  const setIfNotGeofenced = (checkinInfo) => {
    const geofenceId = getGeofenceId(checkinInfo);
    const actCheck = geofencedCheckins.find((gcheck) => (gcheck.geofenceId === geofenceId));
    if (actCheck && actCheck.geofenceStarted) {
      OptionHandler.options.logger.info(`[${MODULE}] This location to ${geofenceId} is already added to geofence`);
      return false;
    }
    if (actCheck) {
      actCheck.geofenceStarted = true;
    }
    return true;
  };

  const getGeofencedCheckins = () => geofencedCheckins;

  const hasGeofencedCheckin = () => geofencedCheckins.length > 0;

  return {
    getGeofenceId,
    getGeofencedCheckins,
    clearAll,
    hasGeofencedCheckin,
    setIfNotGeofenced,
    startCheckLocation,
  };
})();

const Geofence = (() => {
  let idCounter = 0;

  const replaceVars = (str, vars = {}) => Object.keys(vars).reduce((acc, name) => acc.replace(`{${name}}`, vars[name]), str);

  const reconfigure = (options) => OptionHandler.configure(options);

  const geofenceArrivedToApp = (logicalId) => {
    OptionHandler.options.logger.info(`Geofence found and processed with id ${logicalId}`);
    MetaInformation.clearAll();
  };

  const initialize = async (options) => {
    OptionHandler.configure(options);
    if (StatusChecker.getStatus() !== Status.OK) {
      MetaInformation.clearAll();
      await StatusChecker.checkDeviceSettings();
      OptionHandler.options.logger.info(`Geofence initialized, state is ${StatusChecker.getStatus()}`);
    } else {
      OptionHandler.options.logger.info('Geofence already initialized');
    }
    BannerClickHandler.handleBannerClickAfterInitialize();
  };

  /**
     * Calculate distance using Haversine-formula:
     *   a = sin²(Δφ/2) + cos φ1 ⋅ cos φ2 ⋅ sin²(Δλ/2)
     *   c = 2 ⋅ atan2( √a, √(1−a) )
     *   d = R ⋅ c
     * where φ is latitude, λ is longitude, R is earth’s radius (mean radius = 6,371km);
     * note that angles need to be in radians to pass to trig functions!
     */
  const calcDistance = (lat1, lon1, lat2, lon2) => {
    const toRad = (deg) => deg * (Math.PI / 180);

    const fi1 = toRad(lat1);
    const fi2 = toRad(lat2);
    const deltaFi = toRad(lat2 - lat1); // latitude
    const deltaLambda = toRad(lon2 - lon1);

    const a = Math.sin(deltaFi / 2) * Math.sin(deltaFi / 2) + Math.cos(fi1) * Math.cos(fi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    return 2 * EARTH_RADIUS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /**
     * Check watch position
     * @param checkinInfo the check in info
     * @param position the actual watch position
     * @returns {boolean|boolean} returns if in range
     */
  const checkPosition = (checkinInfo, position) => {
    const {
      latitude, longitude, radius,
    } = checkinInfo;
    const distance = calcDistance(latitude, longitude, position.coords.latitude, position.coords.longitude);
    const result = ((distance <= radius + GEOLOCATION_THRESHOLD));
    if (result) {
      OptionHandler.options.logger.info(
        `[${MODULE}] Actual location is inside geofence (distance=${distance}m, radius=${radius}+${GEOLOCATION_THRESHOLD}m): check-in allowed!`,
      );
    }
    return result;
  };

  let lastEnteredCheckinZone = null;
  let lastTimeCheckinZone = 0;
  const doCheck = (checkIn, position) => {
    const now = Date.now();
    if (checkPosition(checkIn, position) && (!lastEnteredCheckinZone || now - lastTimeCheckinZone > CACHE_LOCATION_MILISEC)) {
      lastTimeCheckinZone = now;
      lastEnteredCheckinZone = checkIn;
      OptionHandler.options.logger.info(`[${MODULE}] check-in zone reached, start process callback to ${checkIn.logicalId}`);
      OptionHandler.options.onEnterCheckinZone(checkIn);
      return true;
    }
    return false;
  };

  const validateCheckinInfo = (checkinInfo) => {
    const {
      logicalId, latitude, longitude, radius, airport,
    } = checkinInfo;
    if (!logicalId) {
      throw Error('check-in identifier is invalid!');
    }

    if (typeof (latitude) !== 'number') {
      throw Error('latitude coordinate is invalid!');
    }

    if (typeof (longitude) !== 'number') {
      throw Error('longitude coordinate is invalid!');
    }

    if (typeof (radius) !== 'number') {
      throw Error('radius (in meters) is invalid!');
    }

    if (typeof (airport) !== 'string') {
      throw Error('airport is invalid!');
    }
  };

  const addGeofencedCheckin = (checkinInfo) => {
    if (!StatusChecker.isGeofencingEnabled()) {
      return;
    }
    if (!MetaInformation.setIfNotGeofenced(checkinInfo)) {
      // geofence already started
      return;
    }

    const {
      logicalId, latitude, longitude, radius,
    } = checkinInfo;

    const {
      title, vibration, icons,
    } = OptionHandler.options.notificationConfig;
    const geofenceId = MetaInformation.getGeofenceId(checkinInfo);

    idCounter += 1;
    window.geofence.addOrUpdate({
      id: geofenceId, // a unique identifier of geofence
      latitude, // geo latitude of geofence
      longitude, // geo longitude of geofence
      radius, // radius of geofence in meters
      transitionType: window.TransitionType.ENTER, // type of transition 1 - Enter, 2 - Exit, 3 - Both
      notification: { // notification object
        id: idCounter,
        foreground: false,
        openAppOnClick: true, // is main app activity should be opened after clicking on notification
        data: checkinInfo, // custom object associated with notification
        title: replaceVars(title, checkinInfo), // title on notification
        text: '', // no text
        vibration: vibration || [0], // optional vibration pattern - see description
        ...(icons || {}),
      },
    }).then(() => {
      OptionHandler.options.logger.info(`[${MODULE}] Check-in info successfully added to geofence monitor`, checkinInfo);
    }, (error) => {
      OptionHandler.options.logger.error(`[${MODULE}] Unable to add check-in info to geofence monitor (${logicalId})!`, error);
      throw error;
    });
  };

  const getGeolocationConfig = () => {
    const geolocationConfig = {};
    Object.assign(geolocationConfig, GEOLOCATION_CONFIG, OptionHandler.options.geolocation);
    return geolocationConfig;
  };

  const checkLocation = async (checkinInfo) => {
    if (StatusChecker.getStatus() !== Status.OK) {
      throw Error(`[${MODULE}] Location check can be only called after successful initialization!`);
    }
    try {
      validateCheckinInfo(checkinInfo);
    } catch (err) {
      OptionHandler.options.logger.error(`[${MODULE}] Unable to check geofence: ${err.message}`);
      return false;
    }
    const { checkInPermission } = checkinInfo;

    if (checkInPermission === CheckInPermission.CHECK_IN_NOT_ALLOWED) {
      OptionHandler.options.logger.warn(`[${MODULE}] Check in permission not allowed to checkin to ${checkinInfo.logicalId}`);
      return false;
    }
    MetaInformation.startCheckLocation(checkinInfo);

    const onPositionSuccess = (position) => {
      if (doCheck(checkinInfo, position)) {
        return;
      }
      addGeofencedCheckin(checkinInfo);
    };

    const onPositionError = (error) => {
      OptionHandler.options.logger.error(`[${MODULE}] Getting current location for initializaing geofence failed!`, error);
    };

    OptionHandler.options.logger.info(`[${MODULE}] Checking actual position...`);
    PositionCache.getPosition(getGeolocationConfig()).then(onPositionSuccess, onPositionError);
    return true;
  };

  const getDebugInfos = async () => {
    try {
      const position = await PositionCache.getPosition(getGeolocationConfig());
      OptionHandler.options.logger.info(`[${MODULE}] Debug position is`, position);
      const checkinInfos = [];
      MetaInformation.getGeofencedCheckins().forEach((checkin) => {
        const {
          latitude, longitude, radius, logicalId, name,
        } = checkin.checkinInfo;
        const distance = calcDistance(latitude, longitude, position.coords.latitude, position.coords.longitude);
        checkinInfos.push({
          key: `${logicalId}-${name}`,
          latitude,
          longitude,
          radius,
          distance: `${Math.round(distance)} mtrs`,
        });
      });
      return {
        position: position.coords,
        checkinInfos,
      };
    } catch (err) {
      OptionHandler.options.logger.error(`[${MODULE}] getDebugInfos failed`, err);
      throw err;
    }
  };

  return {
    initialize,
    reconfigure,
    checkLocation,
    getDebugInfos,
    geofenceArrivedToApp,
    isPlatformAndroid,
    Status,
    getStatus: () => StatusChecker.getStatus(),
    hasGeofencedCheckin: MetaInformation.hasGeofencedCheckin,
  };
})();

document.addEventListener('deviceready', () => {
  if (window.geofence) {
    window.geofence.onNotificationClicked = (checkin) => {
      BannerClickHandler.handleBannerClickEvent(checkin);
    };
  }
}, false);

window.Geofence = Geofence;
