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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { geocodingService } from '../../services/geocodingService';
import { COLORS } from '../../theme/colors';
import { GeocodedAddress } from '../../types';

interface DirectionsHeaderProps {
  originText: string;
  destinationText: string;
  onOriginChange: (text: string) => void;
  onDestinationChange: (text: string) => void;
  onSelectAddress: (address: GeocodedAddress, field: 'origin' | 'destination') => void;
  onUseCurrentLocation: (field: 'origin' | 'destination') => void;
  onSwapOriginDestination: () => void;
  onCloseDirections: () => void;
  autoFocusDestination?: boolean;
}

export const DirectionsHeader: React.FC<DirectionsHeaderProps> = ({
  originText,
  destinationText,
  onOriginChange,
  onDestinationChange,
  onSelectAddress,
  onUseCurrentLocation,
  onSwapOriginDestination,
  onCloseDirections,
  autoFocusDestination = false,
}) => {
  const insets = useSafeAreaInsets();
  const [focusedField, setFocusedField] = useState<'origin' | 'destination' | null>(
    autoFocusDestination ? 'destination' : null
  );
  const [results, setResults] = useState<GeocodedAddress[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const query = focusedField === 'origin' ? originText : destinationText;
    if (!focusedField || query.trim().length < 2 || query === 'Ma position') {
      setResults([]);
      setIsSearching(false);
      return;
    }

    let isMounted = true;
    setIsSearching(true);
    const timer = setTimeout(async () => {
      const found = await geocodingService.searchAddresses(query);
      if (isMounted) {
        setResults(found);
        setIsSearching(false);
      }
    }, 220);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [originText, destinationText, focusedField]);

  const handlePick = (item: GeocodedAddress) => {
    if (!focusedField) return;
    onSelectAddress(item, focusedField);
    setFocusedField(null);
    setResults([]);
  };

  const handlePickGps = () => {
    if (!focusedField) return;
    onUseCurrentLocation(focusedField);
    setFocusedField(null);
    setResults([]);
  };

  return (
    <View style={[styles.container, { paddingTop: Math.max(insets.top + 6, 14) }]}>
      <View style={styles.mainRow}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onCloseDirections}
          activeOpacity={0.7}
        >
          <Text style={styles.backIcon}>←</Text>
        </TouchableOpacity>

        {/* Connected Origin / Destination Inputs */}
        <View style={styles.connectorColumn}>
          <View style={styles.blueDotOuter}>
            <View style={styles.blueDotInner} />
          </View>
          <View style={styles.verticalDots}>
            <View style={styles.tinyDot} />
            <View style={styles.tinyDot} />
            <View style={styles.tinyDot} />
          </View>
          <View style={styles.redPin} />
        </View>

        <View style={styles.inputsColumn}>
          <View style={[styles.inputBox, focusedField === 'origin' && styles.inputBoxActive]}>
            <TextInput
              style={styles.textInput}
              placeholder="Point de départ..."
              placeholderTextColor="#70757A"
              value={originText}
              onChangeText={text => {
                onOriginChange(text);
                setFocusedField('origin');
              }}
              onFocus={() => setFocusedField('origin')}
              autoCorrect={false}
              selectTextOnFocus
            />
            {originText.length > 0 && focusedField === 'origin' && (
              <TouchableOpacity onPress={() => onOriginChange('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.inputBox, focusedField === 'destination' && styles.inputBoxActive]}>
            <TextInput
              style={styles.textInput}
              placeholder="Destination (ex: 12 Rue de la Liberté, IUT...)"
              placeholderTextColor="#70757A"
              value={destinationText}
              onChangeText={text => {
                onDestinationChange(text);
                setFocusedField('destination');
              }}
              onFocus={() => setFocusedField('destination')}
              autoFocus={autoFocusDestination}
              autoCorrect={false}
              selectTextOnFocus
            />
            {destinationText.length > 0 && focusedField === 'destination' && (
              <TouchableOpacity onPress={() => onDestinationChange('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Swap Origin <-> Destination Button */}
        <TouchableOpacity
          style={styles.swapBtn}
          onPress={onSwapOriginDestination}
          activeOpacity={0.7}
        >
          <Text style={styles.swapIcon}>⇅</Text>
        </TouchableOpacity>
      </View>

      {/* Autocomplete Suggestions Dropdown */}
      {focusedField && (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" style={styles.dropdownScroll}>
            <TouchableOpacity
              style={styles.gpsRow}
              onPress={handlePickGps}
              activeOpacity={0.75}
            >
              <View style={styles.gpsCircle}>
                <Text style={styles.gpsIcon}>🎯</Text>
              </View>
              <View style={styles.resultTexts}>
                <Text style={styles.gpsTitle}>Ma position</Text>
                <Text style={styles.resultSub}>Position GPS en temps réel</Text>
              </View>
            </TouchableOpacity>

            {isSearching && (
              <View style={styles.searchingRow}>
                <ActivityIndicator size="small" color={COLORS.cassis} />
                <Text style={styles.searchingText}>Recherche d'adresses à Dijon...</Text>
              </View>
            )}

            {results.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.resultRow}
                onPress={() => handlePick(item)}
                activeOpacity={0.75}
              >
                <View
                  style={[
                    styles.resultIconBox,
                    item.type === 'stop' && styles.resultIconStop,
                  ]}
                >
                  <Text style={styles.resultIconText}>
                    {item.type === 'stop' ? '🚏' : item.type === 'poi' ? '⭐' : '📍'}
                  </Text>
                </View>
                <View style={styles.resultTexts}>
                  <Text style={styles.resultTitle} numberOfLines={1}>
                    {item.label}
                  </Text>
                  <Text style={styles.resultSub} numberOfLines={1}>
                    {item.context}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    paddingBottom: 12,
    paddingHorizontal: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 40,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 2,
  },
  backIcon: {
    fontSize: 22,
    fontWeight: '700',
    color: '#202124',
  },
  connectorColumn: {
    alignItems: 'center',
    width: 22,
    marginRight: 8,
  },
  blueDotOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(26, 115, 232, 0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  blueDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1A73E8',
  },
  verticalDots: {
    height: 22,
    justifyContent: 'space-evenly',
    alignItems: 'center',
    marginVertical: 2,
  },
  tinyDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#9AA0A6',
  },
  redPin: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#D93025',
    borderWidth: 2,
    borderColor: '#FAD2CF',
  },
  inputsColumn: {
    flex: 1,
    gap: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F3F4',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  inputBoxActive: {
    backgroundColor: '#FFFFFF',
    borderColor: COLORS.cassis,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#202124',
    padding: 0,
  },
  clearBtn: {
    padding: 4,
  },
  clearText: {
    fontSize: 13,
    color: '#70757A',
    fontWeight: '700',
  },
  swapBtn: {
    width: 38,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  swapIcon: {
    fontSize: 20,
    fontWeight: '800',
    color: '#5F6368',
  },
  dropdown: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E8EAED',
    maxHeight: 290,
  },
  dropdownScroll: {
    paddingTop: 4,
  },
  gpsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  gpsCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E8F0FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  gpsIcon: {
    fontSize: 16,
  },
  gpsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A73E8',
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
  },
  searchingText: {
    fontSize: 13,
    color: '#5F6368',
    fontWeight: '500',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  resultIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F3F4',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  resultIconStop: {
    backgroundColor: '#FCE4EC',
  },
  resultIconText: {
    fontSize: 16,
  },
  resultTexts: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#202124',
  },
  resultSub: {
    fontSize: 12,
    color: '#70757A',
    marginTop: 2,
  },
});
