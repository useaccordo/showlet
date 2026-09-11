# Maintenance approach

Showlet has a fresh public history. Accordo's branded deployment remains a separate private repository. Neither repository automatically publishes changes from the other.

When we improve the private app, consider whether the fix belongs here. Port only the minimal generic change, replace private fixtures, update tests/docs and notices, and review the exact public diff before publication. Do not copy private migrations, account IDs, user lists, graphics, secret scripts, operational notes, or git history.

For every port: check configuration compatibility; keep migration numbering stable; run tests, type checking and a dry-run build; smoke-test relevant browser behavior; scan for private material; update CHANGELOG. Security fixes deserve priority consideration, but no timing is promised. A public improvement can also be applied back to the private app after review.

No unattended sync, bot, or scheduled release is configured. Maintenance is voluntary and best effort, with no support or update guarantee.
