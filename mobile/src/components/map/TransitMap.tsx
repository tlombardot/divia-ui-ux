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

function getLineStrokeStyle(line: TransitLine, dimmed: boolean) {
  if (line.category === 'TRAM') {
    return {
      strokeWidth: dimmed ? 3.2 : 5.5,
      zIndex: 30,
      lineDashPattern: undefined as number[] | undefined,
    };
  }
  if (line.category === 'LIANE') {
    return {
      strokeWidth: dimmed ? 2.4 : 3.8,
      zIndex: 20,
      lineDashPattern: undefined as number[] | undefined,
    };
  }
  return {
    strokeWidth: dimmed ? 1.8 : 2.6,
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
  // Filter visible lines
  const filteredLines = useMemo(() => {
    if (!visibleLineIds) return networkLines;
    return networkLines.filter(l => visibleLineIds.includes(l.id));
  }, [networkLines, visibleLineIds]);

  // Compute parallel corridor offsets so overlapping lines sit cleanly side-by-side
  const offsetLines = useMemo(
    () => computeCorridorOffsets(filteredLines, 15, 10),
    [filteredLines]
  );

  // Filter visible stops (always keep favorite stops & active route stops visible)
  const visibleStops = useMemo(() => {
    if (!visibleLineIds) return ALL_DIJON_STOPS;
    const activeSet = new Set(visibleLineIds);
    const favSet = new Set(favoriteStopIds);

    return ALL_DIJON_STOPS.filter(stop => {
      if (favSet.has(stop.id) || stop.id === selectedStopId) return true;
      return stop.lines.some(lineId => activeSet.has(lineId));
    });
  }, [visibleLineIds, favoriteStopIds, selectedStopId]);

  const activeControllerReports = useMemo(
    () => reports.filter(r => r.status === 'active' && (r.type === 'CONTROLLER' || !r.type)),
    [reports]
  );

  const dimmed = Boolean(activeRoute || showControllersOnly);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.038,
          longitudeDelta: 0.038,
        }}
        showsUserLocation={!userLocation.isDemoMode}
        showsMyLocationButton={false}
        showsCompass={false}
        onPanDrag={onMapPanDrag}
      >
        {/* Divia Network Lines with Parallel Corridor Offsets & Visual Hierarchy */}
        {offsetLines.map(({ line, coordinates }) => {
          if (coordinates.length < 2) return null;
          const styleCfg = getLineStrokeStyle(line, dimmed);

          return (
            <Polyline
              key={`network-${line.id}`}
              coordinates={coordinates}
              strokeColor={dimmed ? `${line.color}40` : line.color}
              strokeWidth={styleCfg.strokeWidth}
              zIndex={styleCfg.zIndex}
              lineDashPattern={styleCfg.lineDashPattern}
              lineCap="round"
              lineJoin="round"
            />
          );
        })}

        {/* Route Terminus & Key-Point Pill Badges on Map (when not in active navigation/filter clutter) */}
        {!activeRoute &&
          !showControllersOnly &&
          offsetLines.map(({ line, coordinates }) => {
            if (coordinates.length < 2) return null;
            const startPt = coordinates[0];
            const endPt = coordinates[coordinates.length - 1];
            const isTram = line.category === 'TRAM';

            return (
              <React.Fragment key={`badges-${line.id}`}>
                <Marker
                  coordinate={startPt}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={isTram ? 35 : 22}
                >
                  <View
                    style={[
                      styles.lineRouteBadge,
                      isTram && styles.lineRouteBadgeTram,
                      { backgroundColor: line.color },
                    ]}
                  >
                    <Text style={styles.lineRouteBadgeText}>{line.id}</Text>
                  </View>
                </Marker>

                <Marker
                  coordinate={endPt}
                  anchor={{ x: 0.5, y: 0.5 }}
                  tracksViewChanges={false}
                  zIndex={isTram ? 35 : 22}
                >
                  <View
                    style={[
                      styles.lineRouteBadge,
                      isTram && styles.lineRouteBadgeTram,
                      { backgroundColor: line.color },
                    ]}
                  >
                    <Text style={styles.lineRouteBadgeText}>{line.id}</Text>
                  </View>
                </Marker>
              </React.Fragment>
            );
          })}

        {/* Active Door-to-Door Route Segments (Always highest zIndex) */}
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
                <Polyline
                  key={`seg-${idx}-transit`}
                  coordinates={coords}
                  strokeColor={segColor}
                  strokeWidth={6.5}
                  lineCap="round"
                  lineJoin="round"
                  zIndex={55}
                />
              );
            })}

            {/* Boarding / Alighting / Destination Markers */}
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
                      description={`Ligne ${segment.lineId}`}
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={60}
                    >
                      <View
                        style={[
                          styles.routeBoardingPin,
                          { backgroundColor: segColor },
                        ]}
                      >
                        <Text style={styles.routePinText}>{segment.lineId}</Text>
                      </View>
                    </Marker>
                  )}
                  {segment.toStop && (
                    <Marker
                      coordinate={{
                        latitude: segment.toStop.latitude,
                        longitude: segment.toStop.longitude,
                      }}
                      title={`Descendre : ${segment.toStop.name}`}
                      anchor={{ x: 0.5, y: 0.5 }}
                      zIndex={60}
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
                zIndex={65}
              >
                <View style={styles.destPinOuter}>
                  <View style={styles.destPinInner} />
                </View>
              </Marker>
            )}
          </>
        )}

        {/* User Position Marker (always shown in Demo Mode or simulation) */}
        {userLocation.isDemoMode && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Votre position"
            anchor={{ x: 0.5, y: 0.5 }}
            zIndex={70}
          >
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {/* Clickable Stations (Tram double ring vs Bus compact dot + Crowd Ring + Favorite Star) */}
        {!showControllersOnly &&
          visibleStops.map(stop => {
            const isSelected = stop.id === selectedStopId;
            const isTramStop = stop.lines.includes('T1') || stop.lines.includes('T2');
            const isFav = favoriteStopIds.includes(stop.id);
            const tramColor = stop.lines.includes('T1') ? '#E11535' : '#4B2982';

            const crowdRep = reports.find(
              r => r.type === 'CROWD' && r.status === 'active' && r.stopId === stop.id && r.crowdLevel
            );
            const crowdColor = crowdRep?.crowdLevel
              ? getCrowdBadgeTheme(crowdRep.crowdLevel).color
              : null;

            return (
              <Marker
                key={stop.id}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={isSelected ? 50 : isTramStop ? 32 : 18}
                onPress={() => onSelectStop && onSelectStop(stop)}
              >
                {isTramStop ? (
                  <View
                    style={[
                      styles.tramStationOuter,
                      { borderColor: crowdColor || tramColor },
                      isSelected && styles.stopMarkerSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.tramStationInner,
                        { backgroundColor: isFav ? '#D97706' : crowdColor || tramColor },
                      ]}
                    />
                  </View>
                ) : (
                  <View
                    style={[
                      styles.busStopMarker,
                      crowdColor ? { borderColor: crowdColor, borderWidth: 2.5 } : null,
                      isFav ? { borderColor: '#D97706', borderWidth: 2.5 } : null,
                      isSelected && styles.stopMarkerSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.stopMarkerCenter,
                        crowdColor ? { backgroundColor: crowdColor } : null,
                        isSelected && styles.stopMarkerCenterSelected,
                      ]}
                    />
                  </View>
                )}
              </Marker>
            );
          })}

        {/* Active Controller Reports Markers (Waze) */}
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
  lineRouteBadge: {
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  lineRouteBadgeTram: {
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  lineRouteBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
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
  tramStationOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
  tramStationInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  busStopMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#5F6368',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopMarkerSelected: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 3.5,
    borderColor: COLORS.cassis,
  },
  stopMarkerCenter: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#5F6368',
  },
  stopMarkerCenterSelected: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cassis,
  },
  routeBoardingPin: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
