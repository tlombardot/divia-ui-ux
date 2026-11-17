import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ALL_DIJON_STOPS, DIJON_LINES, getLineColor } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, RouteOption, TransitLine, TransitStop, UserLocation } from '../../types';
import { getCrowdBadgeTheme } from '../../utils/crowdUtils';
import { computeCorridorOffsets } from '../../utils/polylineOffset';

interface TransitMapProps {
  userLocation: UserLocation;
  reports: Report[];
  networkLines?: TransitLine[];
  visibleLineIds?: string[];
  favoriteStopIds?: string[];
  activeRoute?: RouteOption | null;
  selectedStopId?: string | null;
  showControllersOnly?: boolean;
  isFollowingUser?: boolean;
  floatingBottomOffset?: number;
  hideFloatingButtons?: boolean;
  onSelectReport: (report: Report) => void;
  onOpenReportModal: () => void;
  onSelectStop?: (stop: TransitStop) => void;
  onRecenter?: () => void;
  onMapPanDrag?: () => void;
  mapRef?: React.RefObject<MapView | null>;
}

/**
 * Convert #RRGGBB hex color to rgba() with exact opacity (e.g. 0.35 when dimmed)
 */
function hexWithOpacity(hex: string, opacity: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

function getLineStrokeStyle(line: TransitLine, dimmed: boolean) {
  if (line.category === 'TRAM') {
    return {
      strokeWidth: dimmed ? 3.5 : 5,
      zIndex: 30,
      lineDashPattern: undefined as number[] | undefined,
    };
  }
  if (line.category === 'LIANE') {
    return {
      strokeWidth: dimmed ? 2.5 : 3.5,
      zIndex: 20,
      lineDashPattern: undefined as number[] | undefined,
    };
  }
  return {
    strokeWidth: dimmed ? 2 : 2.5,
    zIndex: 10,
    lineDashPattern: [8, 5] as number[],
  };
}

export const TransitMap: React.FC<TransitMapProps> = ({
  userLocation,
  reports,
  networkLines = DIJON_LINES,
  visibleLineIds,
  favoriteStopIds = [],
  activeRoute,
  selectedStopId,
  showControllersOnly = false,
  isFollowingUser = false,
  floatingBottomOffset = 180,
  hideFloatingButtons = false,
  onSelectReport,
  onOpenReportModal,
  onSelectStop,
  onRecenter,
  onMapPanDrag,
  mapRef,
}) => {
  // Filter visible permanent Divia lines
  const filteredLines = useMemo(() => {
    if (!visibleLineIds) return networkLines;
    return networkLines.filter(l => visibleLineIds.includes(l.id));
  }, [networkLines, visibleLineIds]);

  // Subtle parallel corridor offsets (±2.5m max) so shared T1/T2 corridors stay crisp
  const offsetLines = useMemo(
    () => computeCorridorOffsets(filteredLines, 15, 5, 2.5),
    [filteredLines]
  );

  const dimmed = Boolean(activeRoute || showControllersOnly);

  const activeControllerReports = useMemo(
    () => reports.filter(r => r.status === 'active' && (r.type === 'CONTROLLER' || !r.type)),
    [reports]
  );

  // Active community crowd reports indexed by stopId
  const activeCrowdByStop = useMemo(() => {
    const map = new Map<string, Report>();
    for (const rep of reports) {
      if (rep.status === 'active' && rep.type === 'CROWD' && rep.crowdLevel) {
        const prev = map.get(rep.stopId);
        if (!prev || rep.reportedAt > prev.reportedAt) {
          map.set(rep.stopId, rep);
        }
      }
    }
    return map;
  }, [reports]);

  // Keep native map clean: display ONLY interactive DiviAkhaaa stops
  // (Favorite stations ★, stations with live community crowd reports, or currently selected stop)
  const highlightedStops = useMemo(() => {
    const favSet = new Set(favoriteStopIds);
    return ALL_DIJON_STOPS.filter(
      stop =>
        favSet.has(stop.id) ||
        activeCrowdByStop.has(stop.id) ||
        stop.id === selectedStopId
    );
  }, [favoriteStopIds, activeCrowdByStop, selectedStopId]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.036,
          longitudeDelta: 0.036,
        }}
        showsUserLocation={!userLocation.isDemoMode}
        showsMyLocationButton={false}
        showsCompass={false}
        showsTraffic={false}
        onPanDrag={onMapPanDrag}
      >
        {/* Permanent Divia Tram & Bus Network Lines (cached Google Routes / official shapes) */}
        {offsetLines.map(({ line, coordinates }) => {
          if (coordinates.length < 2) return null;
          const styleCfg = getLineStrokeStyle(line, dimmed);

          return (
            <Polyline
              key={`network-${line.id}`}
              coordinates={coordinates}
              strokeColor={dimmed ? hexWithOpacity(line.color, 0.35) : line.color}
              strokeWidth={styleCfg.strokeWidth}
              zIndex={styleCfg.zIndex}
              lineDashPattern={styleCfg.lineDashPattern}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}

        {/* Exact Door-to-Door Google Routes API (TRANSIT + WALK) Polylines */}
        {activeRoute && activeRoute.segments && (
          <>
            {activeRoute.segments.map((segment, idx) => {
              const coords = segment.polyline.map(([lat, lon]) => ({
                latitude: lat,
                longitude: lon,
              }));

              if (coords.length < 2) return null;

              if (segment.type === 'WALK' || segment.type === 'TRANSFER') {
                return (
                  <Polyline
                    key={`seg-${idx}-walk`}
                    coordinates={coords}
                    strokeColor="#1A73E8"
                    strokeWidth={4.5}
                    lineDashPattern={[6, 6]}
                    lineCap="round"
                    zIndex={50}
                  />
                );
              }

              const segColor =
                segment.lineColor || getLineColor(segment.lineId || 'T1');
              return (
                <React.Fragment key={`seg-${idx}-transit`}>
                  {/* White halo casing so Google Transit routes pop cleanly over map streets */}
                  <Polyline
                    coordinates={coords}
                    strokeColor="#FFFFFF"
                    strokeWidth={9.5}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={53}
                  />
                  <Polyline
                    coordinates={coords}
                    strokeColor={segColor}
                    strokeWidth={6.5}
                    lineCap="round"
                    lineJoin="round"
                    zIndex={55}
                  />
                </React.Fragment>
              );
            })}

            {/* Boarding / Intermediate / Transfer / Alighting Markers */}
            {activeRoute.segments.map((segment, idx) => {
              if (segment.type !== 'TRANSIT') return null;
              const segColor =
                segment.lineColor || getLineColor(segment.lineId || 'T1');

              return (
                <React.Fragment key={`seg-markers-${idx}`}>
                  {segment.fromStop && (
                    <Marker
                      coordinate={{
                        latitude: segment.fromStop.latitude,
                        longitude: segment.fromStop.longitude,
                      }}
                      title={`Monter : ${segment.fromStop.name}`}
                      description={
                        segment.direction
                          ? `${segment.lineId} · ${segment.direction}`
                          : `Ligne ${segment.lineId}`
                      }
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={62}
                    >
                      <View
                        style={[
                          styles.routeBoardingPin,
                          { backgroundColor: segColor },
                        ]}
                      >
                        <Text style={styles.routePinText}>
                          {segment.lineId || 'DIVIA'}
                        </Text>
                      </View>
                    </Marker>
                  )}

                  {segment.passedStops &&
                    segment.passedStops.slice(1, -1).map(interStop => (
                      <Marker
                        key={`inter-${idx}-${interStop.id}`}
                        coordinate={{
                          latitude: interStop.latitude,
                          longitude: interStop.longitude,
                        }}
                        title={interStop.name}
                        anchor={{ x: 0.5, y: 0.5 }}
                        tracksViewChanges={false}
                        zIndex={58}
                      >
                        <View
                          style={[
                            styles.routeIntermediateDot,
                            { borderColor: segColor },
                          ]}
                        />
                      </Marker>
                    ))}

                  {segment.toStop && (
                    <Marker
                      coordinate={{
                        latitude: segment.toStop.latitude,
                        longitude: segment.toStop.longitude,
                      }}
                      title={`Descendre : ${segment.toStop.name}`}
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={62}
                    >
                      <View
                        style={[
                          styles.routeAlightingPin,
                          { borderColor: segColor },
                        ]}
                      />
                    </Marker>
                  )}
                </React.Fragment>
              );
            })}

            {/* Final Destination Pin */}
            {activeRoute.fullPolyline.length > 0 && (
              <Marker
                coordinate={{
                  latitude:
                    activeRoute.fullPolyline[activeRoute.fullPolyline.length - 1][0],
                  longitude:
                    activeRoute.fullPolyline[activeRoute.fullPolyline.length - 1][1],
                }}
                title="Destination"
                zIndex={68}
              >
                <View style={styles.destPinOuter}>
                  <View style={styles.destPinInner} />
                </View>
              </Marker>
            )}
          </>
        )}

        {/* User Position Marker (in Demo Mode or active simulation) */}
        {userLocation.isDemoMode && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Votre position"
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={72}
          >
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {/* Interactive DiviAkhaaa Stations ONLY: Favorites (★), Live Crowd Reports, or Selected */}
        {!showControllersOnly &&
          highlightedStops.map(stop => {
            const isSelected = stop.id === selectedStopId;
            const isFav = favoriteStopIds.includes(stop.id);
            const crowdRep = activeCrowdByStop.get(stop.id);
            const crowdTheme = crowdRep?.crowdLevel
              ? getCrowdBadgeTheme(crowdRep.crowdLevel)
              : null;

            return (
              <Marker
                key={`stop-${stop.id}`}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={isSelected ? 52 : crowdTheme ? 45 : 42}
                onPress={() => onSelectStop && onSelectStop(stop)}
              >
                {isFav ? (
                  <View
                    style={[
                      styles.favoritePin,
                      crowdTheme && { borderColor: crowdTheme.color },
                      isSelected && styles.pinSelectedRing,
                    ]}
                  >
                    <Text style={styles.favoriteStar}>★</Text>
                  </View>
                ) : crowdTheme ? (
                  <View
                    style={[
                      styles.crowdPin,
                      {
                        backgroundColor: crowdTheme.bgColor,
                        borderColor: crowdTheme.color,
                      },
                      isSelected && styles.pinSelectedRing,
                    ]}
                  >
                    <View
                      style={[
                        styles.crowdDot,
                        { backgroundColor: crowdTheme.color },
                      ]}
                    />
                    <Text
                      style={[
                        styles.crowdPinLabel,
                        { color: crowdTheme.color },
                      ]}
                    >
                      {crowdTheme.label}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.selectedStopPin}>
                    <View style={styles.selectedStopPinCore} />
                  </View>
                )}
              </Marker>
            );
          })}

        {/* Active Waze Controller Reports Markers (🚨) */}
        {activeControllerReports.map(report => (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.latitude,
              longitude: report.longitude,
            }}
            zIndex={80}
            onPress={() => onSelectReport(report)}
          >
            <View
              style={[
                styles.reportMarkerBox,
                showControllersOnly && styles.reportMarkerEmphasized,
              ]}
            >
              <Text style={styles.reportIcon}>🚨</Text>
              <View style={styles.reportBadge}>
                <Text style={styles.reportBadgeText}>{report.lineId}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Right Floating Controls Stack (above bottom sheet) */}
      {!hideFloatingButtons && (
        <View
          pointerEvents="box-none"
          style={[styles.floatingStack, { bottom: floatingBottomOffset }]}
        >
          {/* Recenter GPS Button */}
          {onRecenter && (
            <TouchableOpacity
              style={[
                styles.recenterBtn,
                isFollowingUser && styles.recenterBtnActive,
              ]}
              onPress={onRecenter}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.recenterIcon,
                  isFollowingUser && styles.recenterIconActive,
                ]}
              >
                ⌖
              </Text>
            </TouchableOpacity>
          )}

          {/* Waze Controller Report Button with Live Counter Badge */}
          <TouchableOpacity
            style={styles.fabReport}
            onPress={onOpenReportModal}
            activeOpacity={0.85}
          >
            <Text style={styles.fabIcon}>🚨</Text>
            {activeControllerReports.length > 0 && (
              <View style={styles.fabCounter}>
                <Text style={styles.fabCounterText}>
                  {activeControllerReports.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
  },
  map: {
    ...StyleSheet.absoluteFill,
  },
  userMarkerOuter: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(26, 115, 232, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1A73E8',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
  },
  favoritePin: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFBEB',
    borderWidth: 2.5,
    borderColor: '#D97706',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
    elevation: 4,
  },
  favoriteStar: {
    color: '#D97706',
    fontSize: 14,
    fontWeight: '900',
    marginTop: -1,
  },
  crowdPin: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  crowdDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  crowdPinLabel: {
    fontSize: 10,
    fontWeight: '800',
  },
  selectedStopPin: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 3.5,
    borderColor: COLORS.cassis,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  selectedStopPinCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cassis,
  },
  pinSelectedRing: {
    borderWidth: 3,
    borderColor: COLORS.cassis,
    transform: [{ scale: 1.12 }],
  },
  routeBoardingPin: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  routePinText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  routeAlightingPin: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
  },
  routeIntermediateDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
  },
  destPinOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(217, 48, 37, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  destPinInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D93025',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  reportMarkerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportMarkerEmphasized: {
    transform: [{ scale: 1.25 }],
  },
  reportIcon: {
    fontSize: 26,
  },
  reportBadge: {
    backgroundColor: COLORS.error,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    marginTop: -4,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  reportBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
  },
  floatingStack: {
    position: 'absolute',
    right: 14,
    alignItems: 'center',
    gap: 12,
    zIndex: 32,
  },
  recenterBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  recenterBtnActive: {
    backgroundColor: '#E8F0FE',
    borderWidth: 1.5,
    borderColor: '#1A73E8',
  },
  recenterIcon: {
    fontSize: 24,
    fontWeight: '700',
    color: '#5F6368',
  },
  recenterIconActive: {
    color: '#1A73E8',
  },
  fabReport: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  fabIcon: {
    fontSize: 24,
  },
  fabCounter: {
    position: 'absolute',
    top: -3,
    right: -3,
    backgroundColor: COLORS.cassis,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    paddingHorizontal: 4,
  },
  fabCounterText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
});
