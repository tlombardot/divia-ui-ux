import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  ALL_DIJON_STOPS,
  calculateDistanceMeters,
  getLineColor,
  getLiveDeparturesForLine,
} from '../../data/dijonNetwork';
import { SUGGESTED_FAVORITES } from '../../hooks/useFavoriteStations';
import { COLORS } from '../../theme/colors';
import { Report, TransitStop, UserLocation } from '../../types';
import {
  computeStationCrowdStatus,
  getCrowdBadgeTheme,
} from '../../utils/crowdUtils';

interface NearbyStopsContentProps {
  userLocation: UserLocation;
  reports: Report[];
  favoriteStops: TransitStop[];
  isFavorite: (stopId: string) => boolean;
  onToggleFavorite: (stopId: string) => void;
  onSelectStop: (stop: TransitStop) => void;
  onNavigateToStop: (stop: TransitStop) => void;
  onRefreshLocation: () => void;
}

export const NearbyStopsContent: React.FC<NearbyStopsContentProps> = ({
  userLocation,
  reports,
  favoriteStops,
  isFavorite,
  onToggleFavorite,
  onSelectStop,
  onNavigateToStop,
  onRefreshLocation,
}) => {
  const controllerReports = useMemo(
    () => reports.filter(r => r.status === 'active' && (r.type === 'CONTROLLER' || !r.type)),
    [reports]
  );

  const nearbyStops = useMemo(() => {
    return ALL_DIJON_STOPS.map(stop => {
      const distMeters = calculateDistanceMeters(
        userLocation.latitude,
        userLocation.longitude,
        stop.latitude,
        stop.longitude
      );
      const walkMin = Math.max(1, Math.round((distMeters * 1.25) / 75));
      const activeAlert = controllerReports.find(
        r => r.stopId === stop.id || r.stopName === stop.name
      );
      const crowd = computeStationCrowdStatus(stop.id, reports, stop.lines[0]);
      return {
        stop,
        distMeters,
        walkMin,
        hasAlert: Boolean(activeAlert),
        crowd,
      };
    })
      .sort((a, b) => a.distMeters - b.distMeters)
      .slice(0, 8);
  }, [userLocation.latitude, userLocation.longitude, controllerReports, reports]);

  return (
    <View style={styles.container}>
      {/* Top Location Status Header */}
      <View style={styles.topStatusRow}>
        <Text style={styles.topHeaderTitle}>
          {favoriteStops.length > 0 ? '★ Mes Arrêts Favoris' : 'Autour de vous'}
        </Text>

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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ================================================================= */}
        {/* SECTION 1 : MES ARRÊTS FAVORIS (Priority at top)                  */}
        {/* ================================================================= */}
        {favoriteStops.length > 0 ? (
          <View style={styles.favoritesSection}>
            {favoriteStops.map(stop => {
              const primaryLine = stop.lines[0] || 'T1';
              const [dep1, dep2] = getLiveDeparturesForLine(primaryLine);
              const crowd = computeStationCrowdStatus(stop.id, reports, primaryLine);
              const crowdTheme = getCrowdBadgeTheme(crowd.level);
              const alert = controllerReports.find(
                r => r.stopId === stop.id || r.stopName === stop.name
              );

              return (
                <TouchableOpacity
                  key={`fav-${stop.id}`}
                  style={styles.favCard}
                  onPress={() => onSelectStop(stop)}
                  activeOpacity={0.8}
                >
                  <View style={styles.favTopRow}>
                    <View style={styles.favTitleGroup}>
                      <TouchableOpacity
                        onPress={() => onToggleFavorite(stop.id)}
                        style={styles.starBtnSmall}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.starFilled}>★</Text>
                      </TouchableOpacity>
                      <Text style={styles.favStopName} numberOfLines={1}>
                        {stop.name}
                      </Text>
                    </View>

                    {/* Crowd Pill */}
                    <View
                      style={[
                        styles.crowdPill,
                        {
                          backgroundColor: crowdTheme.bgColor,
                          borderColor: crowdTheme.borderColor,
                        },
                      ]}
                    >
                      <Text style={[styles.crowdPillText, { color: crowdTheme.color }]}>
                        {crowdTheme.icon} {crowdTheme.label}
                        {crowd.source === 'community' ? ' · ✓' : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Lines + 2 Next Live Departures + Quick Directions */}
                  <View style={styles.favBottomRow}>
                    <View style={styles.favLinesWrap}>
                      {stop.lines.slice(0, 4).map(lineId => (
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
                      <Text style={styles.favLiveTimes}>
                        ● Dans {dep1} min, {dep2} min
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={styles.quickGoBtn}
                      onPress={() => onNavigateToStop(stop)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.quickGoIcon}>↱</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Immediate Controller Alert Strip if active */}
                  {alert && (
                    <View style={styles.favAlertStrip}>
                      <Text style={styles.favAlertText}>
                        🚨 Contrôleurs signalés ({alert.lineId}) · {alert.direction}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          /* Empty Favorites Invitation Card with 1-tap suggestions */
          <View style={styles.emptyFavCard}>
            <View style={styles.emptyFavHeader}>
              <Text style={styles.emptyFavStar}>☆</Text>
              <View style={styles.emptyFavTexts}>
                <Text style={styles.emptyFavTitle}>Épinglez vos arrêts favoris</Text>
                <Text style={styles.emptyFavSub}>
                  Horaires en direct, affluence et alertes dès l'ouverture
                </Text>
              </View>
            </View>
            <View style={styles.suggestionsRow}>
              {SUGGESTED_FAVORITES.map(stop => (
                <TouchableOpacity
                  key={`sug-${stop.id}`}
                  style={styles.suggestionChip}
                  onPress={() => onToggleFavorite(stop.id)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.suggestionPlus}>+ </Text>
                  <Text style={styles.suggestionText}>{stop.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ================================================================= */}
        {/* SECTION 2 : AUTOUR DE VOUS (Nearest GPS Stops)                    */}
        {/* ================================================================= */}
        {favoriteStops.length > 0 && (
          <View style={styles.subSectionHeader}>
            <Text style={styles.subSectionTitle}>Autour de vous</Text>
            <Text style={styles.subSectionSub}>Triés par distance à pied</Text>
          </View>
        )}

        {nearbyStops.map(({ stop, distMeters, walkMin, hasAlert, crowd }) => {
          const primaryLine = stop.lines[0] || 'T1';
          const [dep1, dep2] = getLiveDeparturesForLine(primaryLine);
          const starred = isFavorite(stop.id);
          const crowdTheme = getCrowdBadgeTheme(crowd.level);

          return (
            <TouchableOpacity
              key={stop.id}
              style={styles.stopCard}
              onPress={() => onSelectStop(stop)}
              activeOpacity={0.75}
            >
              <View style={styles.stopLeft}>
                <View style={styles.stopTitleRow}>
                  <TouchableOpacity
                    onPress={() => onToggleFavorite(stop.id)}
                    style={styles.starBtnSmall}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={starred ? styles.starFilled : styles.starOutline}>
                      {starred ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.stopName} numberOfLines={1}>
                    {stop.name}
                  </Text>
                  {hasAlert && (
                    <View style={styles.alertMiniTag}>
                      <Text style={styles.alertMiniText}>🚨</Text>
                    </View>
                  )}
                </View>

                <View style={styles.metaInlineRow}>
                  <Text style={styles.stopDistance}>
                    🚶 {distMeters < 1000 ? `${distMeters} m` : `${(distMeters / 1000).toFixed(1)} km`} · {walkMin} min
                  </Text>
                  <View
                    style={[
                      styles.crowdMiniPill,
                      { backgroundColor: crowdTheme.bgColor },
                    ]}
                  >
                    <Text style={[styles.crowdMiniText, { color: crowdTheme.color }]}>
                      {crowdTheme.label}
                    </Text>
                  </View>
                </View>

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
    paddingHorizontal: 16,
  },
  topStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  topHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#202124',
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
  favoritesSection: {
    gap: 10,
    marginBottom: 4,
  },
  favCard: {
    backgroundColor: '#FFF9FB',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.5,
    borderColor: '#F3D1DF',
  },
  favTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  favTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  favStopName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    flexShrink: 1,
  },
  crowdPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  crowdPillText: {
    fontSize: 11,
    fontWeight: '800',
  },
  favBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 9,
  },
  favLinesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    flex: 1,
  },
  favLiveTimes: {
    fontSize: 12,
    fontWeight: '800',
    color: '#137333',
    marginLeft: 4,
  },
  quickGoBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.cassis,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  quickGoIcon: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  favAlertStrip: {
    marginTop: 8,
    backgroundColor: '#FCE8E6',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  favAlertText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C5221F',
  },
  emptyFavCard: {
    backgroundColor: '#FBF5F8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F1D4E0',
    marginBottom: 4,
  },
  emptyFavHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyFavStar: {
    fontSize: 24,
    color: COLORS.cassis,
    marginRight: 10,
  },
  emptyFavTexts: {
    flex: 1,
  },
  emptyFavTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.cassis,
  },
  emptyFavSub: {
    fontSize: 12,
    color: '#5F6368',
    marginTop: 2,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E6C2D1',
  },
  suggestionPlus: {
    color: COLORS.cassis,
    fontSize: 13,
    fontWeight: '900',
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202124',
  },
  subSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: 6,
    marginBottom: 2,
  },
  subSectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
  },
  subSectionSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#70757A',
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
    gap: 6,
  },
  starBtnSmall: {
    marginRight: 2,
  },
  starFilled: {
    fontSize: 18,
    color: '#D97706',
  },
  starOutline: {
    fontSize: 18,
    color: '#9AA0A6',
  },
  stopName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    flexShrink: 1,
  },
  alertMiniTag: {
    backgroundColor: '#FCE8E6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  alertMiniText: {
    fontSize: 11,
  },
  metaInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 3,
  },
  stopDistance: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
  },
  crowdMiniPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  crowdMiniText: {
    fontSize: 10,
    fontWeight: '800',
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
