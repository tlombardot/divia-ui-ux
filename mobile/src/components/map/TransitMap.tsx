import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ALL_DIJON_STOPS, DIJON_LINES, getLineColor } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, RouteOption, TransitStop, UserLocation } from '../../types';

interface TransitMapProps {
  userLocation: UserLocation;
  reports: Report[];
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

export const TransitMap: React.FC<TransitMapProps> = ({
  userLocation,
  reports,
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
        {/* Background Divia Network Lines */}
        {DIJON_LINES.map(line => (
          <Polyline
            key={`network-${line.id}`}
            coordinates={line.polyline.map(([latitude, longitude]) => ({
              latitude,
              longitude,
            }))}
            strokeColor={
              activeRoute || showControllersOnly ? `${line.color}38` : `${line.color}CC`
            }
            strokeWidth={activeRoute ? 2.5 : 4}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Active Door-to-Door Route Segments */}
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
                  strokeWidth={6}
                  lineCap="round"
                  lineJoin="round"
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
          >
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {/* Clickable Major Transit Stops */}
        {!showControllersOnly &&
          ALL_DIJON_STOPS.map(stop => {
            const isSelected = stop.id === selectedStopId;
            return (
              <Marker
                key={stop.id}
                coordinate={{
                  latitude: stop.latitude,
                  longitude: stop.longitude,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                onPress={() => onSelectStop && onSelectStop(stop)}
              >
                <View
                  style={[
                    styles.stopMarker,
                    isSelected && styles.stopMarkerSelected,
                  ]}
                >
                  <View
                    style={[
                      styles.stopMarkerCenter,
                      isSelected && styles.stopMarkerCenterSelected,
                    ]}
                  />
                </View>
              </Marker>
            );
          })}

        {/* Active Controller Reports Markers (Waze) */}
        {reports.map(report => (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.latitude,
              longitude: report.longitude,
            }}
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
            {reports.length > 0 && (
              <View style={styles.fabCounter}>
                <Text style={styles.fabCounterText}>{reports.length}</Text>
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
  stopMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#3C4043',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopMarkerSelected: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: COLORS.cassis,
  },
  stopMarkerCenter: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3C4043',
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
