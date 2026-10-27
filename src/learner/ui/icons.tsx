/**
 * The app's icon language. Each meaning has exactly one icon, used
 * everywhere, so learners learn it once: the speaker always means "listen
 * again", the arrow always means "continue", the question mark always means
 * "help".
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 28, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconListen = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" stroke="none" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);

/** Listen slowly: a speaker with a tortoise shell beside it. */
export const IconSlow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 10v4h3l3.5 3V7L5 10H2z" fill="currentColor" stroke="none" />
    <path d="M11 17h10M12 17a5 5 0 0 1 10 0" />
    <path d="M14.5 13.5l2 2 2-2" strokeWidth={1.6} />
  </Svg>
);

export const IconContinue = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Svg>
);

export const IconRetry = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5" />
    <path d="M4 3.5v5h5" />
  </Svg>
);

export const IconHelp = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M10 9.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.3" />
    <circle cx="12" cy="14.5" r=".6" fill="currentColor" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 11l9-7 9 7M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Svg>
);

export const IconPath = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="12" cy="11" r="2.5" />
    <circle cx="18" cy="5" r="2.5" />
    <path d="M7.8 16.2l2.4-3.4M13.8 9.2l2.4-2.4" />
  </Svg>
);

export const IconPractice = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" />
    <path d="M18.5 3v4.5H14M5.5 21v-4.5H10" />
  </Svg>
);

export const IconProgress = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20V14M10 20V9M16 20V12M22 20H2" />
    <path d="M16 5l2 2 3-4" />
  </Svg>
);

export const IconMe = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Svg>
);

export const IconMic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </Svg>
);

export const IconStop = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4l13 8-13 8V4z" fill="currentColor" />
  </Svg>
);

export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M6 10l6 6 6-6M4 20h16" />
  </Svg>
);

export const IconBin = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const IconWifi = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0" />
    <circle cx="12" cy="19.5" r="1" fill="currentColor" />
  </Svg>
);

/** Mobile data: signal bars with a coin (it costs money). */
export const IconMobileData = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 20v-3M7 20v-6M11 20v-9" />
    <circle cx="17.5" cy="8" r="4" />
    <path d="M17.5 6v4" strokeWidth={1.6} />
  </Svg>
);

export const IconOffline = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 18h10a4 4 0 0 0 .9-7.9A6 6 0 0 0 6.6 9.2 4.5 4.5 0 0 0 7 18z" />
    <path d="M3 3l18 18" />
  </Svg>
);

export const IconCloud = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 18h10a4 4 0 0 0 .9-7.9A6 6 0 0 0 6.6 9.2 4.5 4.5 0 0 0 7 18z" />
  </Svg>
);

export const IconPhone = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="2" width="10" height="20" rx="2" />
    <path d="M11 18h2" />
  </Svg>
);

export const IconStar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z" fill="currentColor" />
  </Svg>
);

export const IconFlame = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3c3 3.5 6 6.4 6 10.5a6 6 0 0 1-12 0C6 10.4 8 8.5 9 6.5c.5 2 1.5 3 3 3.5 0-2.4-.4-4.6 0-7z" fill="currentColor" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6l8-3z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
);

export const IconGroup = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 20a6 6 0 0 1 12 0M14.5 15.5A5 5 0 0 1 21 20" />
  </Svg>
);

export const IconQr = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <path d="M14 14h3v3M21 14v7h-7v-3" />
  </Svg>
);

export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Svg>
);

export const IconBackspace = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21 5H8l-6 7 6 7h13V5z" />
    <path d="M12 9l6 6M18 9l-6 6" />
  </Svg>
);

export const IconText = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 18l4-12 4 12M5.5 14h5M15 18l3-8 3 8M16 16h4" />
  </Svg>
);

export const IconCaptions = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 11h5M13 11h5M6 15h9" />
  </Svg>
);

export const IconLanguage = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-5 4V5z" />
    <path d="M8 9h8M8 12h5" />
  </Svg>
);

export const IconLevel = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 20h4v-5h4v-5h4V5h4" />
  </Svg>
);

export const IconExport = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 3h7v7M21 3l-9 9M19 14v6H4V5h6" />
  </Svg>
);

export const IconTeacher = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="7" r="3" />
    <path d="M3 21v-3a5 5 0 0 1 10 0v3M14 5h7v8h-7M17 13l-2 3" />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconWarning = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="18" r=".6" fill="currentColor" />
  </Svg>
);

export const IconEar = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 9a5 5 0 0 1 10 0c0 3-3 4-3 7a3 3 0 0 1-6 0" />
    <path d="M10 9a2 2 0 0 1 4 0c0 1.5-2 2-2 3.5" />
  </Svg>
);

export const IconTone = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h2l2-6 3 12 3-9 2 6 2-3h4" />
  </Svg>
);
