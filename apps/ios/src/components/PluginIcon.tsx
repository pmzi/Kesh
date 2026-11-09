import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { colors, fonts } from '../theme';

interface Props {
  icon?: string;
  name: string;
  size: number;
}

class IconBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode; resetKey?: string },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidUpdate(prev: { resetKey?: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false });
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const Monogram = ({ name, size }: { name: string; size: number }) => (
  <View style={[styles.box, styles.mono, { width: size, height: size, borderRadius: size * 0.225 }]}>
    <Text style={[styles.monoText, { fontSize: size * 0.42 }]}>{name[0]?.toUpperCase() ?? '?'}</Text>
  </View>
);

function PluginIconBase({ icon, name, size }: Props) {
  const mono = <Monogram name={name} size={size} />;
  if (!icon || !icon.trim()) return mono;
  return (
    <IconBoundary fallback={mono} resetKey={icon}>
      <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.225 }]}>
        <SvgXml xml={icon} width={size} height={size} onError={() => {}} />
        <View pointerEvents="none" style={[styles.ring, { borderRadius: size * 0.225 }]} />
      </View>
    </IconBoundary>
  );
}

const PluginIcon = React.memo(PluginIconBase);
export default PluginIcon;

const styles = StyleSheet.create({
  box: { overflow: 'hidden', borderCurve: 'continuous' } as any,
  ring: {
    ...(StyleSheet.absoluteFill as object),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  mono: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.ground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monoText: { fontFamily: fonts.ui, fontWeight: '600', color: colors.text },
});
