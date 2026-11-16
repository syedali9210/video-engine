# Video Engine

Two apps, split out of the Animation Engine (github.com/syedali9210/animation-engine):

| App | What it does | Run it |
| --- | --- | --- |
| [video-engine](video-engine) | Launch films and creatives of your product: templates, the Artist, the Studio (3D devices, scenes, export), the Canvas, your product's kit. The Lab (Gemini, new films, template ideas) runs on your own machine only. | `cd video-engine && npm install && npm run dev` (port 5180) |
| [components](components) | The component library: every animation live in exact device frames, its properties, what it costs each device, the screen builder, the website check, code export and import. | `cd components && npm install && npm run dev` (port 5181) |

Each app has its own `package.json`, dev server and build. The rules for how they look are in each app's
`DESIGN-SYSTEM.md`.
