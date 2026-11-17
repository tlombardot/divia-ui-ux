import { useEffect, useRef } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineFilterPreset } from '../../hooks/useLineFilter';
import { COLORS } from '../../theme/colors';
import { LineCategory, Report, TransitLine } from '../../types';

interface LineFilterSheetProps {
  visible: boolean;
  lines: TransitLine[];
  visibleLineIds: string[];
  controllerReports: Report[];
  onClose: () => void;
  onToggleLine: (lineId: string) => void;
  onApplyPreset: (preset: LineFilterPreset) => void;
  onFocusLine: (line: TransitLine) => void;
}

const CATEGORIES: Array<{ key: LineCategory; title: string; hint: string }> = [
  { key: 'TRAM', title: 'Tramways', hint: 'Trait plein épais' },
  { key: 'LIANE', title: 'Lianes', hint: 'Lignes structurantes' },
  { key: 'BUS', title: 'Bus', hint: 'Trait pointillé' },
];

export const LineFilterSheet: React.FC<LineFilterSheetProps> = ({
  visible,
  lines,
  visibleLineIds,
  controllerReports,
  onClose,
  onToggleLine,
  onApplyPreset,
  onFocusLine,
}) => {
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      translateY.setValue(0);
    }
  }, [visible, translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => gesture.dy > 6,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 90 || gesture.vy > 0.65) {
          Animated.timing(translateY, {
            toValue: 550,
            duration: 180,
            useNativeDriver: true,
          }).start(() => onClose());
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 70,
            friction: 11,
          }).start();
        }
      },
    })
  ).current;

  const isAllActive = visibleLineIds.length === lines.length;
  const isTramsOnly =
    visibleLineIds.length === 2 &&
    visibleLineIds.includes('T1') &&
    visibleLineIds.includes('T2');
  const isTramsLianes =
    visibleLineIds.length === 6 &&
    ['T1', 'T2', 'L3', 'L4', 'L5', 'L6'].every(id => visibleLineIds.includes(id));
  const isNoneActive = visibleLineIds.length === 0;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom + 8, 20),
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Swipeable Drag Handle */}
          <View {...panResponder.panHandlers} style={styles.dragArea}>
            <View style={styles.dragHandle} />
          </View>

          {/* Header */}
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Lignes sur la carte</Text>
              <Text style={styles.subtitle}>
                {visibleLineIds.length}/{lines.length} lignes affichées · Réseau DiviaMobilités
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* 4 Quick Presets */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.presetsRow}
            style={styles.presetsScroll}
          >
            <TouchableOpacity
              style={[styles.presetChip, isAllActive && styles.presetChipActive]}
              onPress={() => onApplyPreset('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetText, isAllActive && styles.presetTextActive]}>
                Tout afficher
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, isTramsOnly && styles.presetChipActive]}
              onPress={() => onApplyPreset('trams')}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetText, isTramsOnly && styles.presetTextActive]}>
                Trams (T1–T2)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, isTramsLianes && styles.presetChipActive]}
              onPress={() => onApplyPreset('trams_lianes')}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetText, isTramsLianes && styles.presetTextActive]}>
                Trams + Lianes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.presetChip, isNoneActive && styles.presetChipActive]}
              onPress={() => onApplyPreset('none')}
              activeOpacity={0.8}
            >
              <Text style={[styles.presetText, isNoneActive && styles.presetTextActive]}>
                Tout masquer
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Grouped Interactive Lines List */}
          <ScrollView
            style={styles.listScroll}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {CATEGORIES.map(cat => {
              const catLines = lines.filter(l => l.category === cat.key);
              if (catLines.length === 0) return null;

              return (
                <View key={cat.key} style={styles.categoryBlock}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryTitle}>{cat.title}</Text>
                    <Text style={styles.categoryHint}>{cat.hint}</Text>
                  </View>

                  {catLines.map(line => {
                    const isVisible = visibleLineIds.includes(line.id);
                    const hasControllerAlert = controllerReports.some(
                      r => r.lineId === line.id
                    );

                    return (
                      <View key={line.id} style={styles.lineRow}>
                        <TouchableOpacity
                          style={styles.lineLeftTouch}
                          onPress={() => onToggleLine(line.id)}
                          activeOpacity={0.75}
                        >
                          <View
                            style={[
                              styles.lineBadge,
                              { backgroundColor: line.color },
                              !isVisible && styles.lineBadgeDimmed,
                            ]}
                          >
                            <Text style={styles.lineBadgeText}>{line.id}</Text>
                          </View>

                          <View style={styles.lineInfo}>
                            <View style={styles.lineTitleRow}>
                              <Text
                                style={[
                                  styles.terminusText,
                                  !isVisible && styles.terminusTextDimmed,
                                ]}
                                numberOfLines={1}
                              >
                                {line.terminusA} ↔ {line.terminusB}
                              </Text>
                              {hasControllerAlert && (
                                <View style={styles.wazeTag}>
                                  <Text style={styles.wazeTagText}>🚨</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.stopsCountText}>
                              {line.stops.length} arrêts majeurs
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {/* Quick "Centrer sur la ligne" Action */}
                        <TouchableOpacity
                          style={styles.focusBtn}
                          onPress={() => onFocusLine(line)}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.focusBtnIcon}>⌖</Text>
                        </TouchableOpacity>

                        {/* Toggle Switch */}
                        <Switch
                          value={isVisible}
                          onValueChange={() => onToggleLine(line.id)}
                          trackColor={{ false: '#E0E0E0', true: `${line.color}88` }}
                          thumbColor={isVisible ? line.color : '#FFFFFF'}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(18, 12, 16, 0.45)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    maxHeight: '84%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 14,
  },
  dragArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 10,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D0D3D6',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: '#202124',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5F6368',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#5F6368',
  },
  presetsScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  presetsRow: {
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    backgroundColor: '#F1F3F4',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  presetChipActive: {
    backgroundColor: COLORS.cassis,
    borderColor: COLORS.cassis,
  },
  presetText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3C4043',
  },
  presetTextActive: {
    color: '#FFFFFF',
  },
  listScroll: {
    flexGrow: 0,
  },
  listContent: {
    paddingBottom: 10,
    gap: 14,
  },
  categoryBlock: {
    gap: 8,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.cassis,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  categoryHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#70757A',
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#ECEFF1',
  },
  lineLeftTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  lineBadge: {
    minWidth: 42,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  lineBadgeDimmed: {
    opacity: 0.35,
  },
  lineBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  lineInfo: {
    flex: 1,
    marginRight: 6,
  },
  lineTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  terminusText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#202124',
    flexShrink: 1,
  },
  terminusTextDimmed: {
    color: '#9AA0A6',
  },
  wazeTag: {
    backgroundColor: '#FCE8E6',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
  },
  wazeTagText: {
    fontSize: 11,
  },
  stopsCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#70757A',
    marginTop: 2,
  },
  focusBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  focusBtnIcon: {
    fontSize: 18,
    color: COLORS.cassis,
    fontWeight: '700',
  },
});
