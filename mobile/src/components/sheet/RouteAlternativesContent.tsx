import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getLineColor } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { RouteOption } from '../../types';

interface RouteAlternativesContentProps {
  routes: RouteOption[];
  selectedRouteId?: string;
  isLoading: boolean;
  onSelectRoute: (route: RouteOption) => void;
}

export const RouteAlternativesContent: React.FC<RouteAlternativesContentProps> = ({
  routes,
  selectedRouteId,
  isLoading,
  onSelectRoute,
}) => {
  if (isLoading) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color={COLORS.cassis} />
        <Text style={styles.loadingTitle}>Calcul porte-à-porte Divia + OSRM...</Text>
        <Text style={styles.loadingSub}>
          Optimisation des correspondances et vérification des alertes Waze
        </Text>
      </View>
    );
  }

  if (routes.length === 0) {
    return (
      <View style={styles.centerBox}>
        <Text style={styles.emptyIcon}>🗺️</Text>
        <Text style={styles.emptyTitle}>Choisissez une destination à Dijon</Text>
        <Text style={styles.emptySub}>
          Tapez une rue (ex. 12 Rue de la Liberté), un lieu ou un arrêt Divia ci-dessus.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.headerTitle}>Itinéraires suggérés</Text>
        <Text style={styles.headerCount}>{routes.length} options</Text>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      >
        {routes.map((route, index) => {
          const isSelected = route.id === selectedRouteId;
          const isRecommended = index === 0;

          return (
            <TouchableOpacity
              key={route.id}
              style={[styles.card, isSelected && styles.cardSelected]}
              onPress={() => onSelectRoute(route)}
              activeOpacity={0.8}
            >
              {/* Top Line: Tag + Duration & Arrival */}
              <View style={styles.topRow}>
                <View style={styles.tagColumn}>
                  <Text style={styles.routeLabel} numberOfLines={1}>
                    {isRecommended ? '⭐ Recommandé' : route.title}
                  </Text>
                  <Text style={styles.timeRange}>
                    {route.departureTime} – {route.arrivalTime} · Arrivée {route.arrivalTime}
                  </Text>
                </View>

                <View style={styles.durationCol}>
                  <Text style={styles.durationText}>{route.totalDurationMinutes} min</Text>
                </View>
              </View>

              {/* Horizontal Multimodal Pill Chain */}
              <View style={styles.chainRow}>
                {route.segments.map((seg, segIdx) => {
                  const isLast = segIdx === route.segments.length - 1;
                  return (
                    <View key={segIdx} style={styles.chainNode}>
                      {seg.type === 'TRANSIT' && seg.lineId ? (
                        <View
                          style={[
                            styles.transitPill,
                            { backgroundColor: seg.lineColor || getLineColor(seg.lineId) },
                          ]}
                        >
                          <Text style={styles.transitPillText}>{seg.lineId}</Text>
                        </View>
                      ) : seg.type === 'WALK' ? (
                        <View style={styles.walkPill}>
                          <Text style={styles.walkPillText}>
                            🚶 {seg.durationMinutes} min
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.transferPill}>
                          <Text style={styles.transferPillText}>🔄</Text>
                        </View>
                      )}

                      {!isLast && <Text style={styles.chevron}>›</Text>}
                    </View>
                  );
                })}
              </View>

              {/* Footer: Frequency & Departure Countdown */}
              <View style={styles.metaRow}>
                {route.transitDurationMinutes > 0 ? (
                  <>
                    <Text style={styles.liveDepartureText}>
                      ● Départ dans {route.nextDepartureMinutes} min
                    </Text>
                    {route.headwayMinutes && (
                      <Text style={styles.headwayText}>
                        Toutes les {route.headwayMinutes} min
                      </Text>
                    )}
                  </>
                ) : (
                  <Text style={styles.walkOnlyMeta}>
                    Trajet direct dans les rues · 0 €
                  </Text>
                )}
              </View>

              {/* Controller Alert Badge */}
              {route.hasControllerAlert && (
                <View style={styles.alertBanner}>
                  <Text style={styles.alertIcon}>🚨</Text>
                  <Text style={styles.alertText}>
                    Contrôleurs signalés sur ce trajet ({route.alerts.length} alerte
                    {route.alerts.length > 1 ? 's' : ''})
                  </Text>
                </View>
              )}
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
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 24,
  },
  loadingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#202124',
    marginTop: 14,
  },
  loadingSub: {
    fontSize: 12,
    color: '#70757A',
    textAlign: 'center',
    marginTop: 6,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#202124',
  },
  emptySub: {
    fontSize: 13,
    color: '#5F6368',
    textAlign: 'center',
    marginTop: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#202124',
  },
  headerCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5F6368',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: 12,
    gap: 12,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardSelected: {
    borderColor: COLORS.cassis,
    backgroundColor: '#FFF7FA',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tagColumn: {
    flex: 1,
    marginRight: 10,
  },
  routeLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.cassis,
  },
  timeRange: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 2,
  },
  durationCol: {
    alignItems: 'flex-end',
  },
  durationText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#202124',
  },
  chainRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 10,
    rowGap: 6,
  },
  chainNode: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  transitPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
  },
  transitPillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  walkPill: {
    backgroundColor: '#F1F3F4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  walkPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3C4043',
  },
  transferPill: {
    paddingHorizontal: 4,
  },
  transferPillText: {
    fontSize: 12,
  },
  chevron: {
    fontSize: 16,
    fontWeight: '700',
    color: '#9AA0A6',
    marginHorizontal: 5,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F3F4',
  },
  liveDepartureText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#137333',
  },
  headwayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#70757A',
  },
  walkOnlyMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FCE8E6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FAD2CF',
  },
  alertIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#C5221F',
  },
});
