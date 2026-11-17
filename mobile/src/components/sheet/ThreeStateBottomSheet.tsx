import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  PanResponder,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../theme/colors';

export type SheetSnapState = 'peek' | 'half' | 'full';

interface ThreeStateBottomSheetProps {
  snapState: SheetSnapState;
  onSnapChange: (state: SheetSnapState) => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

const SCREEN_HEIGHT = Dimensions.get('window').height;

export function getSnapHeight(state: SheetSnapState): number {
  switch (state) {
    case 'peek':
      return Math.round(SCREEN_HEIGHT * 0.19);
    case 'half':
      return Math.round(SCREEN_HEIGHT * 0.50);
    case 'full':
      return Math.round(SCREEN_HEIGHT * 0.90);
  }
}

export const ThreeStateBottomSheet: React.FC<ThreeStateBottomSheetProps> = ({
  snapState,
  onSnapChange,
  children,
  footer,
}) => {
  const insets = useSafeAreaInsets();
  const animatedHeight = useRef(new Animated.Value(getSnapHeight(snapState))).current;
  const currentHeightRef = useRef(getSnapHeight(snapState));
  const dragStartHeightRef = useRef(getSnapHeight(snapState));

  const peekH = getSnapHeight('peek');
  const halfH = getSnapHeight('half');
  const fullH = getSnapHeight('full');

  useEffect(() => {
    const target = getSnapHeight(snapState);
    currentHeightRef.current = target;
    Animated.spring(animatedHeight, {
      toValue: target,
      useNativeDriver: false,
      tension: 65,
      friction: 11,
    }).start();
  }, [snapState, animatedHeight]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        dragStartHeightRef.current = currentHeightRef.current;
      },
      onPanResponderMove: (_, gesture) => {
        // Dragging up => gesture.dy is negative => height increases
        const nextHeight = Math.min(
          fullH,
          Math.max(peekH, dragStartHeightRef.current - gesture.dy)
        );
        animatedHeight.setValue(nextHeight);
        currentHeightRef.current = nextHeight;
      },
      onPanResponderRelease: (_, gesture) => {
        const finalH = currentHeightRef.current;
        const vy = gesture.vy; // negative = flick up, positive = flick down

        let targetState: SheetSnapState = 'half';

        if (vy < -0.45) {
          // Flick up
          targetState = finalH > halfH ? 'full' : 'half';
        } else if (vy > 0.45) {
          // Flick down
          targetState = finalH < halfH ? 'peek' : 'half';
        } else {
          // Nearest snap point
          const distPeek = Math.abs(finalH - peekH);
          const distHalf = Math.abs(finalH - halfH);
          const distFull = Math.abs(finalH - fullH);
          if (distPeek <= distHalf && distPeek <= distFull) {
            targetState = 'peek';
          } else if (distHalf <= distFull) {
            targetState = 'half';
          } else {
            targetState = 'full';
          }
        }

        const targetH = getSnapHeight(targetState);
        currentHeightRef.current = targetH;
        onSnapChange(targetState);
        Animated.spring(animatedHeight, {
          toValue: targetH,
          useNativeDriver: false,
          tension: 65,
          friction: 11,
        }).start();
      },
    })
  ).current;

  const cycleSnap = () => {
    if (snapState === 'peek') onSnapChange('half');
    else if (snapState === 'half') onSnapChange('full');
    else onSnapChange('half');
  };

  return (
    <View pointerEvents="box-none" style={styles.overlayContainer}>
      <Animated.View
        style={[
          styles.sheet,
          {
            height: animatedHeight,
            paddingBottom: footer ? 0 : Math.max(insets.bottom, 12),
          },
        ]}
      >
        {/* Draggable Handle Header */}
        <View {...panResponder.panHandlers} style={styles.dragZone}>
          <TouchableOpacity
            onPress={cycleSnap}
            activeOpacity={0.8}
            style={styles.handleTouch}
          >
            <View style={styles.handleBar} />
          </TouchableOpacity>
        </View>

        {/* Sheet Body */}
        <View style={styles.contentArea}>{children}</View>

        {/* Optional Sticky Footer (e.g. "Démarrer" CTA) */}
        {footer && (
          <View
            style={[
              styles.stickyFooter,
              { paddingBottom: Math.max(insets.bottom, 14) },
            ]}
          >
            {footer}
          </View>
        )}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'flex-end',
    zIndex: 35,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
    overflow: 'hidden',
  },
  dragZone: {
    paddingTop: 10,
    paddingBottom: 6,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  handleTouch: {
    paddingHorizontal: 40,
    paddingVertical: 4,
  },
  handleBar: {
    width: 42,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#D0D3D6',
  },
  contentArea: {
    flex: 1,
  },
  stickyFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
});
