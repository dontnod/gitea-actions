# Gitea actions templates
## Slack notifications (composite action)
caveats: 
- type: composite actions so could only be called in steps (not as a job)


prerequisites:
- need to define a secret SLACK_WEBHOOK_URL in repo
- could only be used on push or pull_request trigger

usage: 
```
- name: slack notification if failure
  if: ${{ failure() }}
  uses: https://github.com/dontnod/gitea-actions/slack-notif@v0
  with:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
    job_build_status: ${{ job.status }}
    server_url: "<your_gitea_server_url>"
```
