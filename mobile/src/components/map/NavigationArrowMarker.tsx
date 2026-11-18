import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface NavigationArrowMarkerProps {
  heading?: number | null;
  isNavigating?: boolean;
}

/**
 * Marqueur de position style Google Maps :
 * - Flèche de guidage 3D bicolore haute visibilité avec biseautage et contour blanc
 * - Halo de précision radar pulsant au sol
 * - Orientation en temps réel selon le cap (heading en degrés)
 */
export const NavigationArrowMarker: React.FC<NavigationArrowMarkerProps> = ({
  heading,
  isNavigating = false,
}) => {
  const rotation = typeof heading === 'number' && !isNaN(heading) ? heading : 0;

  return (
    <View style={styles.container}>
      {/* Halo d'aura radar translucide au sol */}
      <View style={[styles.pulseRing, isNavigating && styles.pulseRingNav]} />

      <View style={[styles.arrowWrapper, { transform: [{ rotate: `${rotation}deg` }] }]}>
        <Svg width={42} height={42} viewBox="0 0 42 42">
          {/* Ombre portée douce */}
          <Path
            d="M21 4 L36 36 L21 28 L6 36 Z"
            fill="rgba(0, 0, 0, 0.22)"
            transform="translate(0, 2)"
          />

          {/* Contour extérieur blanc pour contraste maximal sur la carte */}
          <Path
            d="M21 4 L36 36 L21 28 L6 36 Z"
            fill="#FFFFFF"
            stroke="#FFFFFF"
            strokeWidth={3}
            strokeLinejoin="round"
          />

          {/* Aile gauche (Bleu clair 500 - lumière 3D) */}
          <Path
            d="M21 7 L8 33 L21 27 Z"
            fill="#4285F4"
          />

          {/* Aile droite (Bleu profond 600 - ombre 3D) */}
          <Path
            d="M21 7 L34 33 L21 27 Z"
            fill="#1A73E8"
          />

          {/* Arête centrale illuminée */}
          <Path
            d="M21 7 L21 27"
            stroke="#8AB4F8"
            strokeWidth={1}
            strokeLinecap="round"
          />
        </Svg>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowWrapper: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(26, 115, 232, 0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(26, 115, 232, 0.35)',
  },
  pulseRingNav: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(26, 115, 232, 0.22)',
    borderColor: 'rgba(26, 115, 232, 0.45)',
  },
});
