import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import stylesHref from "../styles.css?url";

// Applied before paint so Garage Mode doesn't flash light on reload.
const garageModeScript = `try{if(localStorage.getItem("garage-mode")==="1")document.documentElement.classList.add("garage")}catch(e){}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Vehicle Work Log" },
      { name: "theme-color", content: "#0c0e11" },
    ],
    links: [{ rel: "stylesheet", href: stylesHref }],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static inline theme script */}
        <script dangerouslySetInnerHTML={{ __html: garageModeScript }} />
      </head>
      <body className="bg-surface text-ink antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
