import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";

import stylesHref from "../styles.css?url";

// Applied before paint so dark mode doesn't flash light on reload. Falls back
// to the OS color-scheme preference when the user hasn't picked a theme.
const themeScript = `try{var t=localStorage.getItem("rigfile-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "RigFile" },
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
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-surface text-ink antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
