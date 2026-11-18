export const View = 'View';
export const Text = 'Text';
export const TouchableOpacity = 'TouchableOpacity';
export const Modal = 'Modal';
export const TextInput = 'TextInput';
export const ScrollView = 'ScrollView';
export const KeyboardAvoidingView = 'KeyboardAvoidingView';
export const Platform = {
  OS: 'ios',
  select: (objs: Record<string, unknown>) => objs.ios ?? objs.default,
};
export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  absoluteFillObject: {},
  absoluteFill: {},
};
export const Animated = {
  Value: class {
    constructor(public val: number) {}
    setValue(v: number) {
      this.val = v;
    }
  },
  timing: () => ({ start: (cb?: () => void) => cb && cb() }),
  spring: () => ({ start: (cb?: () => void) => cb && cb() }),
};
export const PanResponder = {
  create: () => ({ panHandlers: {} }),
};
