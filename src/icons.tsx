import type { SVGProps, ReactNode } from "react";

export function SvgIcon(props: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  const { children, ...rest } = props;
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden width={22} height={22} {...rest}>
      {children}
    </svg>
  );
}

export function IconHome() {
  return (
    <SvgIcon>
      <path d="M12 5.69 19 11.5V21h-5v-6H10v6H5v-9.5L12 5.69zm0 2L7 13.2V19h2v-5h6v5h2v-5.8L12 7.69z" />
    </SvgIcon>
  );
}

export function IconSearch() {
  return (
    <SvgIcon>
      <path d="M10 3a7 7 0 015.6 11.2l4.3 4.3-1.4 1.4-4.3-4.3A7 7 0 114 10a7 7 0 017-7zm0 2a5 5 0 100 10 5 5 0 000-10z" />
    </SvgIcon>
  );
}

export function IconBell() {
  return (
    <SvgIcon>
      <path d="M12 22a2.5 2.5 0 002.45-2H9.55A2.5 2.5 0 0012 22zm9-9V10a9 9 0 10-18 0v3l-2 2v1h22v-1l-2-2zm-2-.17V10a7 7 0 1114 0v2.83L19.83 17H4.17L2 14.83V10a7 7 0 1114 0v4.83L17.83 17h2z" />
    </SvgIcon>
  );
}

export function IconMail() {
  return (
    <SvgIcon>
      <path d="M20 4H4v16h16V4zm-2 2v.43l-8 5-8-5V6h16zm0 11H6v-9.2l6 3.75 6-3.75V17z" />
    </SvgIcon>
  );
}

export function IconSparkles() {
  return (
    <SvgIcon>
      <path d="M9 2l1.2 4L14 8l-3.8 2L9 14l-1.2-4L4 8l3.8-2L9 2zm9 13l-.6 2.8L19 17l-1.4 1.2.6 2.8-2.4-1.6L13.8 21l.6-2.8L12 17l3.8-2L18 15z" />
    </SvgIcon>
  );
}

export function IconBookmark(props: SVGProps<SVGSVGElement> = {}) {
  return (
    <SvgIcon {...props}>
      <path d="M5 3h14v17.5l-7-5-7 5V3zm2 2v12.764l5-3.57 5 3.57V5H7z" />
    </SvgIcon>
  );
}

export function IconUser() {
  return (
    <SvgIcon>
      <path d="M12 11a4 4 0 100-8 4 4 0 000 8zm0 2c5 0 9 2.24 9 5v3H3v-3c0-2.76 4-5 9-5zm0 2c-3.31 0-6.76.93-7 2.12V18h14v-.88c-.24-1.19-3.69-2.12-7-2.12z" />
    </SvgIcon>
  );
}

export function IconDots() {
  return (
    <SvgIcon>
      <path d="M5 13.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm7 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm7 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
    </SvgIcon>
  );
}

export function IconLogoX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={26} height={26} aria-hidden>
      <path d="M18.244 3H21l-7.065 8.074L21 21h-5.488l-4.616-5.397L7.146 21H4l7.566-8.627L4 3h5.659l4.078 4.743L18.244 3zM16.674 18.957h2.089L9.082 5.087H6.839l9.835 13.87z" />
    </svg>
  );
}

export function IconChat(props: SVGProps<SVGSVGElement> = {}) {
  return (
    <SvgIcon {...props}>
      <path d="M4 5h16v11H9l-4 4v-4H4V5zm2 2v7h3v3l3-3h9V7H6z" />
    </SvgIcon>
  );
}

/** X “Premium” / subscription style */
export function IconPremiumBadge() {
  return (
    <SvgIcon>
      <path d="M12 2l2.2 6.8H21l-5.5 4 2.1 6.5L12 15.3 6.4 19.3l2.1-6.5L3 8.8h6.8L12 2zm0 4.2L10.8 9H7.4l2.8 2-1 3.2L12 12.6l2.8 1.6-1-3.2 2.8-2h-3.4L12 6.2z" />
    </SvgIcon>
  );
}

export function IconDocument() {
  return (
    <SvgIcon>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zm0 1.5L18.5 8H14V3.5zM8 20V4h4v5h5v11H8z" />
    </SvgIcon>
  );
}

/** Creator studio / broadcast */
export function IconStudio() {
  return (
    <SvgIcon>
      <path d="M4 8h10v9H4V8zm12-2h2v13h-2V6zm3 3h2v7h-2V9zM6 10h6v5H6v-5z" />
    </SvgIcon>
  );
}

/** Gamepad — XGaming / classic multiplayer */
export function IconGamepad() {
  return (
    <SvgIcon>
      <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zM7 15H5v-2h2v2zm10 0h-2v-2h2v2zm2.5-4.5c-.8 0-1.5-.7-1.5-1.5s.7-1.5 1.5-1.5 1.5.7 1.5 1.5-.7 1.5-1.5 1.5zm-15 0C4.7 9 4 8.3 4 7.5S4.7 6 5.5 6 7 6.7 7 7.5 6.3 9 5.5 9zM10 13h4v2h-4v-2z" />
    </SvgIcon>
  );
}

export function IconGear() {
  return (
    <SvgIcon>
      <path d="M12 15.5A3.5 3.5 0 1112 8a3.5 3.5 0 010 7.5zm7.4-2.5l1.1-2-2.1-1.7.2-2.7-2.6-.6-1.4-2.3h-2.8L12 5.4 9.4 6.7 6.8 7.3l.2 2.7-2.1 1.7 1.1 2 2.5.4 1.3 2.1 1.3-2.1 2.5-.4z" />
    </SvgIcon>
  );
}

/** X-style share (arrow up from tray) */
export function IconShare() {
  return (
    <SvgIcon width={18} height={18}>
      <path d="M4 19v2h16v-2H4zm8-16l7 7h-4v6h-6v-6H5l7-7z" />
    </SvgIcon>
  );
}

/** Impressions / views (small bar chart) */
export function IconViews() {
  return (
    <SvgIcon width={14} height={14}>
      <path d="M4 17h2V9H4v8zm5 0h2V5H9v12zm5 0h2v-6h-2v6z" />
    </SvgIcon>
  );
}

export function IconUserCircle() {
  return (
    <SvgIcon>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a3.5 3.5 0 110 7 3.5 3.5 0 010-7zm0 14c-2.67 0-5.12-1.37-6.5-3.45.02-2.13 4.33-3.3 6.5-3.3s6.48 1.17 6.5 3.3C17.12 17.63 14.67 19 12 19z" />
    </SvgIcon>
  );
}
