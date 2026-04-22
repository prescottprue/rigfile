# Vehicle Work Log

Application for tracking work + maintenance on vehicles

## What's in the stack

- [Multi-region Fly app deployment](https://fly.io/docs/apps/scale-count/) with [Docker](https://www.docker.com/)
- [Multi-region Fly PostgreSQL Cluster](https://fly.io/docs/postgres/advanced-guides/high-availability-and-global-replication/)
- Healthcheck endpoint for [Fly backups region fallbacks](https://fly.io/docs/reference/configuration/#services-http_checks)
- [GitHub Actions](https://github.com/features/actions) for deploy on merge to production and staging environments
- Email/Password Authentication with [cookie-based sessions](https://remix.run/utils/sessions#creatememorysessionstorage)
- Database ORM with [Prisma](https://prisma.io)
- Styling with [Tailwind](https://tailwindcss.com/)
- End-to-end testing with [Cypress](https://cypress.io)
- Local third party request mocking with [MSW](https://mswjs.io)
- Unit testing with [Vitest](https://vitest.dev) and [Testing Library](https://testing-library.com)
- Code formatting with [Prettier](https://prettier.io)
- Linting with [ESLint](https://eslint.org)
- Static Types with [TypeScript](https://typescriptlang.org)

Not a fan of bits of the stack? Fork it, change it, and use `npx create-remix --template your/repo`! Make it your own.

## Development

- Start the Postgres Database in [Docker](https://www.docker.com/get-started):

  ```sh
  npm run docker
  ```

  > **Note:** The npm script will complete while Docker sets up the container in the background. Ensure that Docker has finished and your container is running before proceeding.

- Initial setup:

  ```sh
  npm run setup
  ```

- Run the first build:

  ```sh
  npm run build
  ```

- Start dev server:

  ```sh
  npm run dev
  ```

This starts your app in development mode, rebuilding assets on file changes.

The database seed script creates a new user with some data you can use to get started:

- Email: `rachel@remix.run`
- Password: `racheliscool`

If you'd prefer not to use Docker, you can also use Fly's Wireguard VPN to connect to a development database (or even your production database). You can find the instructions to set up Wireguard [here](https://fly.io/docs/reference/private-networking/#install-your-wireguard-app), and the instructions for creating a development database [here](https://fly.io/docs/reference/postgres/).

## Deployment

This Remix Stack comes with two GitHub Actions that handle automatically deploying your app to production and staging environments.

Prior to your first deployment, you'll need to do a few things:

- [Install Fly](https://fly.io/docs/getting-started/installing-flyctl/)

- Sign up and log in to Fly

  ```sh
  fly auth signup
  ```

  > **Note:** If you have more than one Fly account, ensure that you are signed into the same account in the Fly CLI as you are in the browser. In your terminal, run `fly auth whoami` and ensure the email matches the Fly account signed into the browser.

- Create two apps on Fly, one for staging and one for production:

  ```sh
  fly apps create vehicle-work-log-337f
  fly apps create vehicle-work-log-337f-staging
  ```

  > **Note:** Once you've successfully created an app, double-check the `fly.toml` file to ensure that the `app` key is the name of the production app you created. This Stack [automatically appends a unique suffix at init](https://github.com/remix-run/blues-stack/blob/4c2f1af416b539187beb8126dd16f6bc38f47639/remix.init/index.js#L29) which may not match the apps you created on Fly. You will likely see [404 errors in your Github Actions CI logs](https://community.fly.io/t/404-failure-with-deployment-with-remix-blues-stack/4526/3) if you have this mismatch.

- Initialize Git.

  ```sh
  git init
  ```

- Create a new [GitHub Repository](https://repo.new), and then add it as the remote for your project. **Do not push your app yet!**

  ```sh
  git remote add origin <ORIGIN_URL>
  ```

- Add a `FLY_API_TOKEN` to your GitHub repo. To do this, go to your user settings on Fly and create a new [token](https://web.fly.io/user/personal_access_tokens/new), then add it to [your repo secrets](https://docs.github.com/en/actions/security-guides/encrypted-secrets) with the name `FLY_API_TOKEN`.

- Add a `SESSION_SECRET` to your fly app secrets, to do this you can run the following commands:

  ```sh
  fly secrets set SESSION_SECRET=$(openssl rand -hex 32) --app vehicle-work-log-337f
  fly secrets set SESSION_SECRET=$(openssl rand -hex 32) --app vehicle-work-log-337f-staging
  ```

  > **Note:** When creating the staging secret, you may get a warning from the Fly CLI that looks like this:
  >
  > ```
  > WARN app flag 'vehicle-work-log-337f-staging' does not match app name in config file 'vehicle-work-log-337f'
  > ```
  >
  > This simply means that the current directory contains a config that references the production app we created in the first step. Ignore this warning and proceed to create the secret.

  If you don't have openssl installed, you can also use [1password](https://1password.com/password-generator/) to generate a random secret, just replace `$(openssl rand -hex 32)` with the generated secret.

- Create a database for both your staging and production environments. Run the following:

  ```sh
  fly postgres create --name vehicle-work-log-337f-db
  fly postgres attach --app vehicle-work-log-337f vehicle-work-log-337f-db

  fly postgres create --name vehicle-work-log-337f-staging-db
  fly postgres attach --app vehicle-work-log-337f-staging vehicle-work-log-337f-staging-db
  ```

  > **Note:** You'll get the same warning for the same reason when attaching the staging database that you did in the `fly set secret` step above. No worries. Proceed!

Fly will take care of setting the `DATABASE_URL` secret for you.

Now that everything is set up you can commit and push your changes to your repo. Every commit to your `main` branch will trigger a deployment to your production environment, and every commit to your `dev` branch will trigger a deployment to your staging environment.

If you run into any issues deploying to Fly, make sure you've followed all of the steps above and if you have, then post as many details about your deployment (including your app name) to [the Fly support community](https://community.fly.io). They're normally pretty responsive over there and hopefully can help resolve any of your deployment issues and questions.

### Multi-region deploys

Once you have your site and database running in a single region, you can add more regions by following [Fly's Scaling](https://fly.io/docs/reference/scaling/) and [Multi-region PostgreSQL](https://fly.io/docs/getting-started/multi-region-databases/) docs.

Make certain to set a `PRIMARY_REGION` environment variable for your app. You can use `[env]` config in the `fly.toml` to set that to the region you want to use as the primary region for both your app and database.

#### Testing your app in other regions

Install the [ModHeader](https://modheader.com/) browser extension (or something similar) and use it to load your app with the header `fly-prefer-region` set to the region name you would like to test.

You can check the `x-fly-region` header on the response to know which region your request was handled by.

## GitHub Actions

We use GitHub Actions for continuous integration and deployment. Anything that gets into the `main` branch will be deployed to production after running tests/build/etc. Anything in the `dev` branch will be deployed to staging.

## Pit Lane — maintenance & feature development (Claude agents)

Day-to-day maintenance and feature work on this project is run by **Pit
Lane**, a crew of Claude Code agents that live as GitHub Actions. They turn
GitHub Issues into a roadmap and groomed issues into PRs. The personas are
named after shop/garage roles — if you're used to standard PM / Architect /
Builder terminology, the mapping is spelled out below.

### The crew

| Pit Lane name | Classic role | What it does | Lives in |
|---------------|--------------|--------------|----------|
| **Service Writer** | Product Manager | Triages new issues, sets priority/complexity/milestone, writes up the full spec, gatekeeps scope & security | `SERVICE_WRITER.md` + `.github/workflows/groom-issues.yml` |
| **Chief Mechanic** | Software Architect | Periodic architecture review (auth/ownership audit, N+1 scan, schema hygiene, Fly-replay check, route-boundary error handling) — files issues for what it finds | `CHIEF_MECHANIC.md` |
| **Crew Chief** | DevOps / Platform Engineer | Periodic CI/CD & infra review (workflows, Dockerfile, Fly deploy, secrets) — files `area:devops` issues | `CREW_CHIEF.md` |
| **Wrench** | Builder / feature implementer | Picks a groomed issue, branches, implements against acceptance criteria, runs tests, opens a PR with `Closes #N` | `.github/workflows/build-next.yml` + `.github/workflows/build-issue.yml` |
| **Test Driver** | QA / UX reviewer | Runs on every PR that touches user-facing code; comments with affected flows, a manual test plan, and UX/a11y/mobile notes | `TEST_DRIVER.md` + `.github/workflows/test-driver.yml` |

See `AGENT.md` for the full project context each agent reads.

### Flow

1. **Open an issue** using the bug or feature template. The **Service
   Writer** auto-grooms it: scope check → security check → priority
   (`priority:P0`–`P3`) → complexity (`complexity:S`–`XL`) → phase
   milestone, and then either
   - asks clarifying questions (`status:needs-clarification`) — reply on
     the issue and grooming re-triggers automatically, or
   - writes the full spec (Problem, Solution, Implementation Plan,
     Acceptance Criteria, Key Files, Constraints, Dependencies) and marks
     the issue `status:groomed`.
2. **Kick off a build** in one of three ways:
   - Comment `/build` on any groomed issue → a **Wrench** claims it
     (`status:in-progress`), branches, implements against the acceptance
     criteria, runs `npm run typecheck` / `npm test` / `npm run lint`, and
     opens a PR with `Closes #<number>`.
   - Manually run the **Build Next** workflow with no input to auto-pick
     the highest-priority groomed issue.
   - Manually run **Build Next** with a specific issue number.
3. **Test Driver** posts a review comment automatically on the PR (only
   for PRs that touch `app/routes`, `app/components`, `app/root.tsx`,
   `app/tailwind.css`, or `prisma/schema.prisma`). The comment lists the
   affected user flows, a concrete manual test plan, and UX/a11y/mobile
   notes.
4. **Review the PR.** Comment `@claude` anywhere on the PR to have the
   review agent (`claude-review.yml`) respond or make changes.
5. **Merge.** Squash-merge with a [conventional commit](https://www.conventionalcommits.org/)
   title (`feat:`, `fix:`, `chore:`, etc.). The issue auto-closes via
   `Closes #<number>` and `deploy.yml` ships the change to Fly.

### Re-groom or reset an issue

Comment `/groom` on any issue to strip existing status labels and re-run
the full grooming protocol from scratch — useful after significant
discussion or when requirements change.

### Issue labels

| Label | Meaning |
|-------|---------|
| `status:needs-info` | Incomplete — waiting on reporter for basic information |
| `status:needs-clarification` | Design questions — Service Writer has technical/architectural questions; auto-retriggers grooming when answered |
| `status:groomed` | Fully specified — ready for a Wrench |
| `status:in-progress` | Claimed by a Wrench |
| `status:deferred` | Intentionally delayed |
| `area:devops` | CI/CD, Docker, Fly, or workflow changes — skipped by `build-next` (GitHub Actions can't modify its own workflow files); the Crew Chief files these, humans or desktop Claude Code implement them |
| `priority:P0`–`P3` / `complexity:S`–`XL` | Set by the Service Writer during grooming |

### Required secret

Add `CLAUDE_CODE_OAUTH_TOKEN` to the repo's GitHub Actions secrets.
Without it the agent workflows will fail to authenticate. The existing
`FLY_API_TOKEN` (used by `deploy.yml`) is unchanged.

### Running agents locally

The same prompts live under `.claude/commands/`. In a Claude Code session
you can run `/groom-issues` (Service Writer) or `/build-next` (Wrench,
with optional `devops` arg) locally — handy for `area:devops` work that
the automated Wrench can't do.

## Testing

### Cypress

We use Cypress for our End-to-End tests in this project. You'll find those in the `cypress` directory. As you make changes, add to an existing file or create a new file in the `cypress/e2e` directory to test your changes.

We use [`@testing-library/cypress`](https://testing-library.com/cypress) for selecting elements on the page semantically.

To run these tests in development, run `npm run test:e2e:dev` which will start the dev server for the app as well as the Cypress client. Make sure the database is running in docker as described above.

We have a utility for testing authenticated features without having to go through the login flow:

```ts
cy.login();
// you are now logged in as a new user
```

We also have a utility to auto-delete the user at the end of your test. Just make sure to add this in each test file:

```ts
afterEach(() => {
  cy.cleanupUser();
});
```

That way, we can keep your local db clean and keep your tests isolated from one another.

### Vitest

For lower level tests of utilities and individual components, we use `vitest`. We have DOM-specific assertion helpers via [`@testing-library/jest-dom`](https://testing-library.com/jest-dom).

### Type Checking

This project uses TypeScript. It's recommended to get TypeScript set up for your editor to get a really great in-editor experience with type checking and auto-complete. To run type checking across the whole project, run `npm run typecheck`.

### Linting

This project uses ESLint for linting. That is configured in `.eslintrc.js`.

### Formatting

We use [Prettier](https://prettier.io/) for auto-formatting in this project. It's recommended to install an editor plugin (like the [VSCode Prettier plugin](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)) to get auto-formatting on save. There's also a `npm run format` script you can run to format all files in the project.
