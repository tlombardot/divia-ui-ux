import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { QUICK_STOPS } from '../../data/dijonNetwork';
import { COLORS } from '../../theme/colors';
import { TransitStop } from '../../types';

interface FloatingSearchHeaderProps {
  onOpenSearch: () => void;
  onSelectQuickStop: (stop: TransitStop) => void;
  showControllersOnly: boolean;
  onToggleControllersFilter: () => void;
  activeReportsCount: number;
  isDemoMode: boolean;
}

const FEATURED_CHIP_IDS = [
  'hub-gare',
  'hub-darcy',
  'hub-republique',
  'hub-universite',
  't2-toison',
  'hub-monge',
];

export const FloatingSearchHeader: React.FC<FloatingSearchHeaderProps> = ({
  onOpenSearch,
  onSelectQuickStop,
  showControllersOnly,
  onToggleControllersFilter,
  activeReportsCount,
  isDemoMode,
}) => {
  const insets = useSafeAreaInsets();
  const featuredStops = FEATURED_CHIP_IDS.map(id =>
    QUICK_STOPS.find(s => s.id === id)
  ).filter((s): s is TransitStop => Boolean(s));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { paddingTop: Math.max(insets.top + 8, 16) }]}
    >
      {/* Floating Pill Search Bar */}
      <View style={styles.pillRow}>
        <TouchableOpacity
          style={styles.searchPill}
          onPress={onOpenSearch}
          activeOpacity={0.9}
        >
          <View style={styles.brandDot}>
            <Text style={styles.brandDotText}>D</Text>
          </View>
          <Text style={styles.placeholderText} numberOfLines={1}>
            Où allez-vous ?
          </Text>
          {isDemoMode && (
            <View style={styles.demoTag}>
              <Text style={styles.demoTagText}>Démo</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.directionsCircle}
            onPress={onOpenSearch}
            activeOpacity={0.85}
          >
            <Text style={styles.directionsIcon}>↱</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>

      {/* Floating Quick Chips + Waze Controller Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsScroll}
        style={styles.chipsContainer}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            styles.wazeFilterChip,
            showControllersOnly && styles.wazeFilterChipActive,
          ]}
          onPress={onToggleControllersFilter}
          activeOpacity={0.8}
        >
          <Text style={styles.chipEmoji}>🚨</Text>
          <Text
            style={[
              styles.chipText,
              showControllersOnly && styles.wazeFilterTextActive,
            ]}
          >
            Contrôleurs Waze
          </Text>
          {activeReportsCount > 0 && (
            <View
              style={[
                styles.countPill,
                showControllersOnly && styles.countPillActive,
              ]}
            >
              <Text
                style={[
                  styles.countPillText,
                  showControllersOnly && styles.countPillTextActive,
                ]}
              >
                {activeReportsCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {featuredStops.map(stop => (
          <TouchableOpacity
            key={stop.id}
            style={styles.chip}
            onPress={() => onSelectQuickStop(stop)}
            activeOpacity={0.8}
          >
            <Text style={styles.chipStopDot}>●</Text>
            <Text style={styles.chipText}>
              {stop.name === 'Monge Cité de la Gastronomie' ? 'Monge' : stop.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
  pillRow: {
    paddingHorizontal: 14,
  },
  searchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    height: 52,
    borderRadius: 26,
    paddingLeft: 10,
    paddingRight: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  brandDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: COLORS.cassis,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  brandDotText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  placeholderText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#5F6368',
  },
  demoTag: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 10,
    marginRight: 8,
  },
  demoTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#E65100',
  },
  directionsCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.cassis,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionsIcon: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  chipsContainer: {
    marginTop: 10,
  },
  chipsScroll: {
    paddingHorizontal: 14,
    gap: 8,
    paddingBottom: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 4,
  },
  chipEmoji: {
    fontSize: 13,
    marginRight: 5,
  },
  chipStopDot: {
    fontSize: 8,
    color: COLORS.cassis,
    marginRight: 6,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#202124',
  },
  wazeFilterChip: {
    borderWidth: 1,
    borderColor: '#FADBD8',
  },
  wazeFilterChipActive: {
    backgroundColor: COLORS.error,
    borderColor: COLORS.error,
  },
  wazeFilterTextActive: {
    color: '#FFFFFF',
  },
  countPill: {
    backgroundColor: COLORS.error,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 6,
    paddingHorizontal: 4,
  },
  countPillActive: {
    backgroundColor: '#FFFFFF',
  },
  countPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  countPillTextActive: {
    color: COLORS.error,
  },
});
