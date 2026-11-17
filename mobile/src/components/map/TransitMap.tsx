import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { ALL_DIJON_STOPS, DIJON_LINES } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, TransitStop, UserLocation } from '../../types';

interface TransitMapProps {
  userLocation: UserLocation;
  reports: Report[];
  onSelectReport: (report: Report) => void;
  onOpenReportModal: () => void;
  onSelectStop?: (stop: TransitStop) => void;
}

export const TransitMap: React.FC<TransitMapProps> = ({
  userLocation,
  reports,
  onSelectReport,
  onOpenReportModal,
  onSelectStop,
}) => {
  return (
    <View style={styles.container}>
      <MapView
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
        {/* Draw Dijon Lines Polylines */}
        {DIJON_LINES.map(line => (
          <Polyline
            key={line.id}
            coordinates={line.polyline.map(([latitude, longitude]) => ({
              latitude,
              longitude,
            }))}
            strokeColor={line.color}
            strokeWidth={4.5}
            lineCap="round"
            lineJoin="round"
          />
        ))}

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
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: COLORS.textPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopMarkerCenter: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
