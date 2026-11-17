import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { QUICK_STOPS } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { RouteOption, TransitStop } from '../../types';

interface RouteSearchBarProps {
  destinationText: string;
  onDestinationChange: (text: string) => void;
  onSelectQuickStop: (stop: TransitStop) => void;
  selectedRoute: RouteOption | null;
  availableRoutes: RouteOption[];
  onSelectRoute: (route: RouteOption) => void;
  onStartNavigation: () => void;
}

export const RouteSearchBar: React.FC<RouteSearchBarProps> = ({
  destinationText,
  onDestinationChange,
  onSelectQuickStop,
  selectedRoute,
  availableRoutes,
  onSelectRoute,
  onStartNavigation,
}) => {
  return (
    <View style={styles.card}>
      {/* Origin / Destination Connected Inputs */}
      <View style={styles.inputsWrapper}>
        <View style={styles.dotsColumn}>
          <View style={styles.originDot} />
          <View style={styles.connectingLine} />
          <View style={styles.destSquare} />
        </View>

        <View style={styles.inputsColumn}>
          <View style={styles.inputBox}>
            <Text style={styles.originLabel}>Ma position actuelle (GPS)</Text>
          </View>
          <View style={styles.inputDivider} />
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Où allez-vous ? (ex: Gare, Université, Darcy)"
              placeholderTextColor={COLORS.textMuted}
              value={destinationText}
              onChangeText={onDestinationChange}
              autoCorrect={false}
            />
          </View>
        </View>
      </View>

      {/* Quick Stop Chips */}
      <View style={styles.chipsSection}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
        >
          {QUICK_STOPS.map(stop => (
            <TouchableOpacity
              key={stop.id}
              style={styles.chip}
              onPress={() => onSelectQuickStop(stop)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>{stop.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Route Proposals */}
      {availableRoutes.length > 0 && (
        <View style={styles.routesList}>
          {availableRoutes.map(route => {
            const isSelected = selectedRoute?.id === route.id;
            return (
              <TouchableOpacity
                key={route.id}
                style={[styles.routeItem, isSelected && styles.routeItemSelected]}
                onPress={() => onSelectRoute(route)}
                activeOpacity={0.8}
              >
                <View style={styles.routeHeader}>
                  <View style={styles.routeBadges}>
                    {route.steps
                      .filter(s => s.type === 'transit' && s.lineId)
                      .map((step, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.lineBadge,
                            { backgroundColor: step.lineColor || COLORS.cassis },
                          ]}
                        >
                          <Text style={styles.lineBadgeText}>{step.lineId}</Text>
                        </View>
                      ))}
                    {route.steps.every(s => s.type === 'walk') && (
                      <View style={[styles.lineBadge, { backgroundColor: '#757575' }]}>
                        <Text style={styles.lineBadgeText}>À pied</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.liveIndicator}>
                    <Text style={styles.liveDeparture}>
                      Prochain départ dans {route.nextDepartureMinutes} min
                    </Text>
                  </View>
                </View>

                <View style={styles.routeFooter}>
                  <Text style={styles.routeDuration}>
                    {route.totalDurationMinutes} min
                  </Text>
                  <Text style={styles.routeTimes}>
                    {route.departureTime} ➜ {route.arrivalTime}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}

          {selectedRoute && (
            <TouchableOpacity
              style={styles.startButton}
              onPress={onStartNavigation}
              activeOpacity={0.85}
            >
              <Text style={styles.startButtonText}>
                Démarrer l'itinéraire ({selectedRoute.totalDurationMinutes} min)
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginHorizontal: 16,
    marginTop: -8,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 20,
  },
  inputsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 10,
  },
  dotsColumn: {
    alignItems: 'center',
    width: 20,
    marginRight: 8,
  },
  originDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0078D4',
  },
  connectingLine: {
    width: 2,
    height: 22,
    backgroundColor: COLORS.borderStrong,
    marginVertical: 3,
  },
  destSquare: {
    width: 10,
    height: 10,
    backgroundColor: COLORS.cassis,
    borderRadius: 2,
  },
  inputsColumn: {
    flex: 1,
  },
  inputBox: {
    height: 32,
    justifyContent: 'center',
  },
  originLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  inputDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 2,
  },
  textInput: {
    fontSize: 14,
    color: COLORS.textPrimary,
    fontWeight: '600',
    padding: 0,
  },
  chipsSection: {
    marginTop: 10,
  },
  chipsScroll: {
    paddingVertical: 2,
    gap: 8,
  },
  chip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  routesList: {
    marginTop: 12,
    gap: 8,
  },
  routeItem: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  routeItemSelected: {
    borderColor: COLORS.cassis,
    backgroundColor: '#FFF5F8',
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  routeBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  lineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lineBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  liveIndicator: {
    backgroundColor: '#E6F4EA',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  liveDeparture: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.success,
  },
  routeFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  routeDuration: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
  },
  routeTimes: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  startButton: {
    backgroundColor: COLORS.cassis,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
