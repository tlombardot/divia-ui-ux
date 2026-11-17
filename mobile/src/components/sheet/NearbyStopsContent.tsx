import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  getLineColor,
  getLiveDeparturesForLine,
} from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { Report, TransitStop, UserLocation } from '../../types';

interface NearbyStopsContentProps {
  userLocation: UserLocation;
  reports: Report[];
  onSelectStop: (stop: TransitStop) => void;
  onRefreshLocation: () => void;
}

export const NearbyStopsContent: React.FC<NearbyStopsContentProps> = ({
  userLocation,
  reports,
  onSelectStop,
  onRefreshLocation,
}) => {
  const nearbyStops = useMemo(() => {
    return ALL_DIJON_STOPS.map(stop => {
      const distMeters = calculateDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        stop.latitude,
        stop.longitude
      );
      const walkMin = Math.max(1, Math.round((distMeters * 1.25) / 75));
      const activeAlert = reports.find(
        r => r.status === 'active' && (r.stopId === stop.id || r.stopName === stop.name)
      );
      return {
        stop,
        distMeters,
        walkMin,
        hasAlert: Boolean(activeAlert),
      };
    })
      .sort((a, b) => a.distMeters - b.distMeters)
      .slice(0, 8);
  }, [userLocation.latitude, userLocation.longitude, reports]);

  return (
    <View style={styles.container}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.sectionTitle}>Autour de vous</Text>
          <Text style={styles.sectionSubtitle}>
            Arrêts Divia triés par distance à pied
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.locationStatusPill,
            userLocation.isDemoMode ? styles.pillDemo : styles.pillGps,
          ]}
          onPress={onRefreshLocation}
          activeOpacity={0.75}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: userLocation.isDemoMode ? '#F57C00' : '#1E8E3E' },
            ]}
          />
          <Text
            style={[
              styles.statusText,
              { color: userLocation.isDemoMode ? '#E65100' : '#137333' },
            ]}
          >
            {userLocation.isDemoMode ? 'Démo · Darcy' : 'GPS Actif'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable Stops List */}
      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {nearbyStops.map(({ stop, distMeters, walkMin, hasAlert }) => {
          const primaryLine = stop.lines[0] || 'T1';
          const [dep1, dep2] = getLiveDeparturesForLine(primaryLine);

          return (
            <TouchableOpacity
              key={stop.id}
              style={styles.stopCard}
              onPress={() => onSelectStop(stop)}
              activeOpacity={0.75}
            >
              <View style={styles.stopLeft}>
                <View style={styles.stopTitleRow}>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.name}
                  </Text>
                  {hasAlert && (
                    <View style={styles.alertMiniTag}>
                      <Text style={styles.alertMiniText}>🚨 Contrôle</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.stopDistance}>
                  🚶 {distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`} · {walkMin} min
                </Text>

                {/* Official Divia Line Badges */}
                <View style={styles.linesRow}>
                  {stop.lines.map(lineId => (
                    <View
                      key={lineId}
                      style={[
                        styles.linePill,
                        { backgroundColor: getLineColor(lineId) },
                      ]}
                    >
                      <Text style={styles.linePillText}>{lineId}</Text>
                    </View>
                  ))}
                </View>
              </View>

              {/* Live Next Departures */}
              <View style={styles.departuresBox}>
                <View style={styles.liveDotRow}>
                  <View style={styles.liveGreenDot} />
                  <Text style={styles.depPrimary}>{dep1} min</Text>
                </View>
                <Text style={styles.depSecondary}>{dep2} min</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#202124',
  },
  sectionSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#70757A',
    marginTop: 2,
  },
  locationStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
  },
  pillGps: {
    backgroundColor: '#E6F4EA',
  },
  pillDemo: {
    backgroundColor: '#FFF3E0',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 10,
    gap: 10,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  stopLeft: {
    flex: 1,
    marginRight: 10,
  },
  stopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    flexShrink: 1,
  },
  alertMiniTag: {
    backgroundColor: '#FCE8E6',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  alertMiniText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.error,
  },
  stopDistance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 3,
  },
  linesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
  },
  linePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  linePillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  departuresBox: {
    alignItems: 'flex-end',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8EAED',
    minWidth: 70,
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E8E3E',
    marginRight: 5,
  },
  depPrimary: {
    fontSize: 14,
    fontWeight: '900',
    color: '#137333',
  },
  depSecondary: {
    fontSize: 11,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 2,
  },
});
