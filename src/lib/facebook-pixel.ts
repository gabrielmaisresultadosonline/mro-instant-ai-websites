
export const FB_PIXEL_ID = "1995582991049400";

declare global {
  interface Window {
    fbq: any;
    _fbq: any;
  }
}

export const initFbPixel = () => {
  if (typeof window === 'undefined' || window.fbq) return;

  const f = window;
  const b = document;
  const e = 'script';
  const v = 'https://connect.facebook.net/en_US/fbevents.js';
  
  let n: any;
  
  if (f.fbq) return;
  
  n = f.fbq = function() {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  
  if (!f._fbq) f._fbq = n;
  n.push = n;
  n.loaded = !0;
  n.version = '2.0';
  n.queue = [];
  
  const t = b.createElement(e) as HTMLScriptElement;
  t.async = !0;
  t.src = v;
  
  const s = b.getElementsByTagName(e)[0];
  if (s && s.parentNode) {
    s.parentNode.insertBefore(t, s);
  }
  
  window.fbq('init', FB_PIXEL_ID);
};

export const fbEvent = (name: string, data?: any) => {
  if (typeof window !== 'undefined' && window.fbq) {
    window.fbq('track', name, data);
  }
};
