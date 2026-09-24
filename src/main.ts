import "./style.css";
import "./expert-grid.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/latin-700.css";
import "@fontsource/roboto-slab/latin-600.css";
import "@fontsource/roboto-slab/latin-700.css";
import mascotUrl from "./brand/tako-bako-mascot-512.png";
import markUrl from "./brand/tako-bako-mark-512.png";
import { mountApp } from "./app";

mountApp({ mascotUrl, markUrl });
