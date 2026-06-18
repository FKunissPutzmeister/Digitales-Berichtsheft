/* entry.js — single ES-module entry compiled into ../app/silk/silk-bundle.js.
 * Imperative mount API for the vanilla controller (app/js/react-theme-layer.js).
 * Uses the ReactBits components VERBATIM (./components/*).
 */
import { createRoot } from 'react-dom/client';
import { createElement as h } from 'react';

import Silk from './components/Silk.jsx';
import GlassSurface from './components/GlassSurface.jsx';
import BlurText from './components/BlurText.jsx';
import GradientText from './components/GradientText.jsx';
import DotField from './components/DotField.jsx';
import './silk-theme.css';

function mount(el, element) {
  const root = createRoot(el);
  root.render(element);
  return root;
}

/* Full-screen Silk shader — exact ReactBits demo (color #5227FF). */
export function mountSilk(el, opts = {}) {
  return mount(el, h(Silk, { speed: 5, scale: 1, color: '#5227FF', noiseIntensity: 1.5, rotation: 0, ...opts }));
}

/* DotField — login background (cursor glow + bulge). */
export function mountDotField(el, opts = {}) {
  return mount(
    el,
    h(DotField, {
      dotRadius: 1.5,
      dotSpacing: 14,
      bulgeStrength: 67,
      glowRadius: 200,
      sparkle: false,
      waveAmplitude: 0,
      gradientFrom: 'rgba(82, 39, 255, 0.45)',
      gradientTo: 'rgba(180, 151, 207, 0.30)',
      glowColor: '#5227FF',
      ...opts,
    })
  );
}

/* GlassSurface backing for BUTTONS — the genuine ReactBits glass-button
 * design (frosted + chromatic displacement + inset highlights). Buttons
 * are few/small, so the per-frame backdrop-filter cost stays bounded. */
export function mountGlassButton(el, opts = {}) {
  const { radius = 999, frost = 0.18, ...rest } = opts;
  return mount(
    el,
    h(GlassSurface, {
      width: '100%',
      height: '100%',
      borderRadius: radius,
      backgroundOpacity: frost,
      brightness: 60,
      blur: 11,
      saturation: 1.4,
      ...rest,
    })
  );
}

/* BlurText — animated heading reveal. opts.text required. */
export function mountBlurText(el, opts = {}) {
  return mount(el, h(BlurText, { text: '', animateBy: 'words', direction: 'top', delay: 110, ...opts }));
}

/* GradientText — animated gradient heading. opts.text required. */
export function mountGradientText(el, opts = {}) {
  const { text = '', colors = ['#5227FF', '#FF9FFC', '#B497CF'], animationSpeed = 8, ...rest } = opts;
  return mount(el, h(GradientText, { colors, animationSpeed, ...rest }, text));
}

const SilkReact = { mountSilk, mountDotField, mountGlassButton, mountBlurText, mountGradientText };
export default SilkReact;
