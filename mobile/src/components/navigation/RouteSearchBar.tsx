import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { QUICK_STOPS } from '../../data/dijonNetwork';
import { geocodingService } from '../../services/geocodingService';
import { COLORS } from '../../theme/colors';
import { GeocodedAddress, RouteOption, TransitStop } from '../../types';

interface RouteSearchBarProps {
  originText: string;
  destinationText: string;
  onOriginChange: (text: string) => void;
  onDestinationChange: (text: string) => void;
  onSelectAddress: (address: GeocodedAddress, targetField: 'origin' | 'destination') => void;
  onSelectQuickStop: (stop: TransitStop) => void;
  selectedRoute: RouteOption | null;
  availableRoutes: RouteOption[];
  onSelectRoute: (route: RouteOption) => void;
  onStartNavigation: () => void;
  isLoadingRoutes?: boolean;
}

export const RouteSearchBar: React.FC<RouteSearchBarProps> = ({
  originText,
  destinationText,
  onOriginChange,
  onDestinationChange,
  onSelectAddress,
  onSelectQuickStop,
  selectedRoute,
  availableRoutes,
  onSelectRoute,
  onStartNavigation,
  isLoadingRoutes = false,
}) => {
  const [activeSearchField, setActiveSearchField] = useState<'origin' | 'destination' | null>(null);
  const [autocompleteResults, setAutocompleteResults] = useState<GeocodedAddress[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Autocomplétion BAN + Arrêts Divia en temps réel
  useEffect(() => {
    const query = activeSearchField === 'origin' ? originText : destinationText;
    if (!activeSearchField || query.length < 2) {
      setAutocompleteResults([]);
      return;
    }

    let isMounted = true;
    setIsSearching(true);

    const timer = setTimeout(async () => {
      const results = await geocodingService.searchAddresses(query);
      if (isMounted) {
        setAutocompleteResults(results);
        setIsSearching(false);
      }
    }, 200);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [originText, destinationText, activeSearchField]);

  const handleSelectResult = (address: GeocodedAddress) => {
    if (activeSearchField) {
      onSelectAddress(address, activeSearchField);
      setActiveSearchField(null);
      setAutocompleteResults([]);
    }
  };

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
          {/* Depart */}
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Départ (ex: Ma position, Darcy, Gare...)"
              placeholderTextColor={COLORS.textMuted}
              value={originText}
              onChangeText={t => {
                onOriginChange(t);
                setActiveSearchField('origin');
              }}
              onFocus={() => setActiveSearchField('origin')}
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputDivider} />

          {/* Arrivee */}
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Destination (ex: 12 Rue de la Liberté, Toison d'Or...)"
              placeholderTextColor={COLORS.textMuted}
              value={destinationText}
              onChangeText={t => {
                onDestinationChange(t);
                setActiveSearchField('destination');
              }}
              onFocus={() => setActiveSearchField('destination')}
              autoCorrect={false}
            />
          </View>
        </View>
      </View>

      {/* Autocomplete Dropdown List */}
      {activeSearchField && autocompleteResults.length > 0 && (
        <View style={styles.autocompleteCard}>
          {isSearching && (
            <ActivityIndicator size="small" color={COLORS.cassis} style={styles.loader} />
          )}
          {autocompleteResults.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.autocompleteItem}
              onPress={() => handleSelectResult(item)}
              activeOpacity={0.7}
            >
              <Text style={styles.autocompleteIcon}>
                {item.type === 'stop' ? '🚏' : item.type === 'poi' ? '📍' : '🏠'}
              </Text>
              <View style={styles.autocompleteTexts}>
                <Text style={styles.autocompleteLabel}>{item.label}</Text>
                <Text style={styles.autocompleteContext}>{item.context}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Quick Stop Chips */}
      {!activeSearchField && (
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
      )}

      {/* Loading state */}
      {isLoadingRoutes && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLORS.cassis} />
          <Text style={styles.loadingText}>Calcul des meilleurs itinéraires...</Text>
        </View>
      )}

      {/* Route Proposals */}
      {!activeSearchField && availableRoutes.length > 0 && (
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
                  <View style={styles.titleWithBadges}>
                    <Text style={styles.routeTitle}>{route.title || route.summary}</Text>
                    <View style={styles.badgesRow}>
                      {route.segments
                        ? route.segments.map((seg, idx) => {
                            if (seg.type === 'TRANSIT' && seg.lineId) {
                              return (
                                <View
                                  key={idx}
                                  style={[
                                    styles.lineBadge,
                                    { backgroundColor: seg.lineColor || COLORS.cassis },
                                  ]}
                                >
                                  <Text style={styles.lineBadgeText}>{seg.lineId}</Text>
                                </View>
                              );
                            }
                            if (seg.type === 'WALK') {
                              return (
                                <View key={idx} style={styles.walkBadge}>
                                  <Text style={styles.walkBadgeText}>🚶 {seg.durationMinutes}m</Text>
                                </View>
                              );
                            }
                            return null;
                          })
                        : route.steps
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
                    </View>
                  </View>

                  <View style={styles.durationBox}>
                    <Text style={styles.durationBig}>{route.totalDurationMinutes} min</Text>
                    <Text style={styles.durationTimes}>
                      {route.departureTime} - {route.arrivalTime}
                    </Text>
                  </View>
                </View>

                {/* Controller Alert Banner if active on this route */}
                {route.hasControllerAlert && (
                  <View style={styles.controllerAlertBadge}>
                    <Text style={styles.alertIcon}>🚨</Text>
                    <Text style={styles.alertText}>
                      Contrôle signalé sur ce tracé ({route.alerts?.length || 1} alerte active)
                    </Text>
                  </View>
                )}
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
                Démarrer la navigation GPS ({selectedRoute.totalDurationMinutes} min)
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
    zIndex: 30,
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
    height: 24,
    backgroundColor: COLORS.borderStrong,
    marginVertical: 2,
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
  autocompleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    maxHeight: 220,
  },
  loader: {
    paddingVertical: 6,
  },
  autocompleteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surface,
  },
  autocompleteIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  autocompleteTexts: {
    flex: 1,
  },
  autocompleteLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  autocompleteContext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
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
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
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
    alignItems: 'flex-start',
  },
  titleWithBadges: {
    flex: 1,
  },
  routeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  lineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lineBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
  },
  walkBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  walkBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  durationBox: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  durationBig: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textPrimary,
  },
  durationTimes: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  controllerAlertBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDEDED',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F5C6CB',
  },
  alertIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  alertText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.error,
  },
  startButton: {
    backgroundColor: COLORS.cassis,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  startButtonText: {
    color: COLORS.textOnPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
});
