import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ALL_DIJON_STOPS, DIJON_LINES } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, RouteOption, TransitStop, UserLocation } from '../../types';

interface TransitMapProps {
  userLocation: UserLocation;
  reports: Report[];
  activeRoute?: RouteOption | null;
  onSelectReport: (report: Report) => void;
  onOpenReportModal: () => void;
  onSelectStop?: (stop: TransitStop) => void;
  onRecenter?: () => void;
  mapRef?: React.RefObject<MapView | null>;
}

export const TransitMap: React.FC<TransitMapProps> = ({
  userLocation,
  reports,
  activeRoute,
  onSelectReport,
  onOpenReportModal,
  onSelectStop,
  onRecenter,
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
          latitudeDelta: 0.045,
          longitudeDelta: 0.045,
        }}
        showsUserLocation={!userLocation.isDemoMode}
        showsCompass={false}
      >
        {/* Draw Full Background Dijon Network Lines */}
        {DIJON_LINES.map(line => (
          <Polyline
            key={`network-${line.id}`}
            coordinates={line.polyline.map(([latitude, longitude]) => ({
              latitude,
              longitude,
            }))}
            strokeColor={activeRoute ? `${line.color}44` : line.color}
            strokeWidth={activeRoute ? 2.5 : 4.5}
            lineCap="round"
            lineJoin="round"
          />
        ))}

        {/* Draw Active Door-to-Door Route Segments */}
        {activeRoute && activeRoute.segments && (
          <>
            {activeRoute.segments.map((segment, idx) => {
              const coords = segment.polyline.map(([lat, lon]) => ({
                latitude: lat,
                longitude: lon,
              }));

              if (coords.length < 2) return null;

              if (segment.type === 'WALK') {
                return (
                  <Polyline
                    key={`seg-${idx}-walk`}
                    coordinates={coords}
                    strokeColor="#333333"
                    strokeWidth={4.5}
                    lineDashPattern={[6, 6]}
                    lineCap="round"
                  />
                );
              }

              return (
                <Polyline
                  key={`seg-${idx}-transit`}
                  coordinates={coords}
                  strokeColor={segment.lineColor || COLORS.cassis}
                  strokeWidth={6}
                  lineCap="round"
                  lineJoin="round"
                />
              );
            })}
          </>
        )}

        {/* User Marker if in demo mode */}
        {userLocation.isDemoMode && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Votre position (Mode Démo)"
            description="Position calée sur Darcy"
          >
            <View style={styles.userMarkerOuter}>
              <View style={styles.userMarkerInner} />
            </View>
          </Marker>
        )}

        {/* Major Transit Stops */}
        {ALL_DIJON_STOPS.map(stop => (
          <Marker
            key={stop.id}
            coordinate={{
              latitude: stop.latitude,
              longitude: stop.longitude,
            }}
            title={stop.name}
            description={`Lignes : ${stop.lines.join(', ')}`}
            onPress={() => onSelectStop && onSelectStop(stop)}
          >
            <View style={styles.stopMarker}>
              <View style={styles.stopMarkerCenter} />
            </View>
          </Marker>
        ))}

        {/* Active Controller Reports Markers */}
        {reports.map(report => (
          <Marker
            key={report.id}
            coordinate={{
              latitude: report.latitude,
              longitude: report.longitude,
            }}
            title={`Contrôle : ${report.stopName}`}
            description={`${report.lineId} · Fiabilité ${report.reliabilityScore}%`}
            onPress={() => onSelectReport(report)}
          >
            <View style={styles.reportMarkerBox}>
              <Text style={styles.reportIcon}>🚨</Text>
              <View style={styles.reportBadge}>
                <Text style={styles.reportBadgeText}>{report.lineId}</Text>
              </View>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Recenter Button */}
      {onRecenter && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={onRecenter}
          activeOpacity={0.8}
        >
          <Text style={styles.recenterIcon}>🎯</Text>
        </TouchableOpacity>
      )}

      {/* Floating Action Button (Waze style report in 2 taps) */}
      <TouchableOpacity
        style={styles.fabReport}
        onPress={onOpenReportModal}
        activeOpacity={0.85}
      >
        <Text style={styles.fabIcon}>🚨</Text>
        <Text style={styles.fabText}>Signaler un contrôle</Text>
      </TouchableOpacity>
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
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 120, 212, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMarkerInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#0078D4',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  stopMarker: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopMarkerCenter: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: COLORS.textPrimary,
  },
  reportMarkerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportIcon: {
    fontSize: 26,
  },
  reportBadge: {
    backgroundColor: COLORS.error,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: -4,
  },
  reportBadgeText: {
    color: '#FFF',
    fontSize: 9,
    fontWeight: '900',
  },
  recenterBtn: {
    position: 'absolute',
    top: 130,
    right: 16,
    backgroundColor: '#FFFFFF',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 25,
  },
  recenterIcon: {
    fontSize: 20,
  },
  fabReport: {
    position: 'absolute',
    bottom: 30,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.error,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 40,
  },
  fabIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
