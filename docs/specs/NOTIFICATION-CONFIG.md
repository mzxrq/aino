# Notification Configuration

The system supports LINE and email notifications for anomaly detection. Both can be enabled/disabled via environment variables.

## Configuration

Add these environment variables to your `.env` file:

```env
# Notification feature flags (set to "false" to disable)
ENABLE_LINE_NOTIFICATIONS=true
ENABLE_EMAIL_NOTIFICATIONS=true
```

## Disabling Notifications

If you're experiencing issues with LINE API (400 errors, authentication problems, etc.), you can temporarily disable LINE notifications:

```env
ENABLE_LINE_NOTIFICATIONS=false
ENABLE_EMAIL_NOTIFICATIONS=true
```

This will:
- Skip all LINE notification attempts
- Continue processing anomaly detection normally
- Still send email notifications (if enabled)
- Log a debug message when LINE is disabled

## Error Handling

The system now provides detailed error logging for notification failures:

### LINE Errors
```
Failed to send LINE notification (HTTP 400): {"message":"Invalid user ID"}
```

### Email Errors
```
Failed to send email notification (HTTP 500): Internal server error
```

Error messages are truncated to 200 characters to keep logs readable while providing debugging information.

## Troubleshooting

### LINE 400 Bad Request
Common causes:
- Invalid `CHANNEL_ACCESS_TOKEN`
- User LINE ID is not valid or user hasn't added the bot
- Flex message format is incorrect

**Solution**: Set `ENABLE_LINE_NOTIFICATIONS=false` until the issue is resolved.

### Email 500 Internal Server Error
Common causes:
- Node mail service is not running
- `MAIL_API_URL` is incorrect or not accessible
- Mail service configuration issue

**Solution**: Set `ENABLE_EMAIL_NOTIFICATIONS=false` or fix the mail service.

## Monitoring

Check logs for notification statistics:
```
Notification stats: {'notified_users': 1, 'line_sent': 0, 'email_sent': 1, ...}
```

- `notified_users`: Number of users who should receive notifications
- `line_sent`: Number of successful LINE sends
- `email_sent`: Number of successful email sends
