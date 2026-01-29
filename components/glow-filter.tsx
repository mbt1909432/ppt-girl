import React, { memo } from "react";

export interface GlowSettings {
  color: string; // Hex color for glow
  outlineWidth: number; // Outline thickness
  glowRadius: number; // Glow blur radius
  opacity: number; // Overall glow opacity
}

interface Props {
  id: string;
  settings: GlowSettings;
}

/**
 * SVG filter that creates an outline + glow around transparent PNG assets.
 * Render once and reference via `filter: url(#id)` on the target element.
 * 
 * Performance: Uses React.memo to prevent unnecessary re-renders when props haven't changed.
 */
const GlowFilter: React.FC<Props> = ({ id, settings }) => {
  const { color, outlineWidth, glowRadius, opacity } = settings;

  return (
    <svg style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter 
          id={id} 
          x="-100%" 
          y="-100%" 
          width="300%" 
          height="300%"
          // Performance hint: GPU acceleration
          style={{ willChange: "filter" }}
        >
          {/* 1) Expand the alpha channel to create an outline */}
          <feMorphology
            in="SourceAlpha"
            result="dilated"
            operator="dilate"
            radius={outlineWidth}
          />

          {/* 2) Fill the outline with the desired color */}
          <feFlood floodColor={color} floodOpacity={opacity} result="flood" />
          <feComposite in="flood" in2="dilated" operator="in" result="outline" />

          {/* 3) Layered blur for a soft glow halo */}
          <feGaussianBlur
            in="outline"
            stdDeviation={glowRadius * 0.3}
            result="coreGlow"
          />
          <feGaussianBlur in="outline" stdDeviation={glowRadius} result="softGlow" />

          {/* 4) Merge glow + outline + original graphic */}
          <feMerge>
            <feMergeNode in="softGlow" />
            <feMergeNode in="coreGlow" />
            <feMergeNode in="outline" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
};

// Memoize to prevent re-renders when props haven't changed
export default memo(GlowFilter, (prevProps, nextProps) => {
  // Custom comparison: only re-render if settings actually changed
  return (
    prevProps.id === nextProps.id &&
    prevProps.settings.color === nextProps.settings.color &&
    prevProps.settings.outlineWidth === nextProps.settings.outlineWidth &&
    prevProps.settings.glowRadius === nextProps.settings.glowRadius &&
    prevProps.settings.opacity === nextProps.settings.opacity
  );
});

