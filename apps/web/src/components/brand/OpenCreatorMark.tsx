import type { SVGProps } from 'react';

export default function OpenCreatorMark({
  size = 18,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> & { size?: number }) {
  return (
    <svg
      {...props}
      className={className === undefined ? 'opencreator-mark' : `opencreator-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 460 460"
      focusable="false"
    >
      <polygon
        points="308,125 292,126 278,135 270,150 272,169 278,178 289,186 296,188 319,186 329,190 337,200 339,213 331,228 217,342 209,360 208,384 214,401 228,419 399,250 405,238 404,217 392,202 381,198 352,199 337,188 331,175 333,151 330,141 319,129"
        fill="currentColor"
      />
      <polygon
        points="230,39 59,208 53,220 54,241 59,250 72,259 96,259 115,246 125,246 137,255 139,270 128,287 125,307 129,319 139,329 150,333 162,333 175,328 261,242 267,231 268,218 264,207 258,199 244,191 227,191 219,195 171,240 155,238 145,225 147,211 234,124 246,106 251,85 249,69 242,53"
        fill="currentColor"
      />
    </svg>
  );
}
