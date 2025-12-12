DOCUMENTATION GUIDE FOR NEW FEATURES AND UPDATES

This guide defines the process for creating and maintaining documentation for the Stock Dashboard project.

=============================================================================
DOCUMENTATION REQUIREMENTS
=============================================================================

MANDATORY ELEMENTS FOR ALL DOCUMENTATION FILES:

1. TIMESTAMP (UTC+9 Osaka Time)
   - Created: YYYY-MM-DD HH:MM JST
   - Last Updated: YYYY-MM-DD HH:MM JST
   - Place at the top of every documentation file

2. CONTENT FOCUS
   - Minimal markdown formatting
   - Maximum content and technical details
   - Direct, concise language
   - No unnecessary styling or decorations

3. FILE LOCATION
   - Technical specifications: docs/specs/
   - Feature documentation: docs/features/
   - API documentation: docs/specs/API.md (append to existing)
   - Architecture changes: docs/specs/ARCHITECTURE.md (update existing)

=============================================================================
DOCUMENTATION TYPES
=============================================================================

TYPE 1: NEW FEATURE DOCUMENTATION

Location: docs/features/FEATURE-NAME.md

Required sections:
- Timestamps (created, last updated)
- Feature name and purpose
- Technical implementation details
- File paths and line numbers for key code
- API endpoints (if applicable)
- Database schema changes (if applicable)
- Dependencies and prerequisites
- Configuration requirements
- Testing approach
- Known limitations

Example filename: docs/features/USER-NOTIFICATIONS.md

TYPE 2: API ENDPOINT DOCUMENTATION

Location: docs/specs/API.md (append to existing file)

Required information:
- Timestamp of addition
- Endpoint path and method
- Request parameters with types
- Response format with examples
- Authentication requirements
- Error codes and messages
- Related database collections
- Example curl/PowerShell commands

TYPE 3: ARCHITECTURE CHANGES

Location: docs/specs/ARCHITECTURE.md (update in place)

Required updates:
- Add timestamp to changelog section
- Update affected diagrams or flow descriptions
- Document new services or components
- Update dependency information
- Note breaking changes

TYPE 4: DATABASE SCHEMA CHANGES

Location: docs/specs/database-schema.md (update in place)

Required updates:
- Timestamp of change
- Collection name
- New fields with types and constraints
- Index changes
- Migration notes (if data migration needed)
- Related API endpoints

=============================================================================
DOCUMENTATION CREATION PROCESS
=============================================================================

STEP 1: DETERMINE DOCUMENTATION TYPE
- Is this a completely new feature? → Create new file in docs/features/
- Is this an API endpoint? → Append to docs/specs/API.md
- Is this an architecture change? → Update docs/specs/ARCHITECTURE.md
- Is this a database change? → Update docs/specs/database-schema.md

STEP 2: ADD TIMESTAMP HEADER
Format:
Created: 2025-12-12 14:30 JST
Last Updated: 2025-12-12 14:30 JST

STEP 3: WRITE CONTENT (MINIMAL MARKDOWN)
Focus on:
- Technical accuracy
- Code references with file paths and line numbers
- Concrete examples
- Implementation details
- No fluff, no excessive formatting

STEP 4: REFERENCE RELATED FILES
Always include:
- File paths for modified/created files
- Line numbers for key implementations
- Links to related documentation

STEP 5: UPDATE INDEX (if creating new file)
Add entry to docs/README.md or relevant index file

=============================================================================
DOCUMENTATION UPDATE PROCESS
=============================================================================

WHEN TO UPDATE DOCUMENTATION:
- Feature functionality changes
- API endpoints modified
- New dependencies added
- Configuration changes
- Bug fixes that affect behavior
- Performance improvements
- Security updates

HOW TO UPDATE:
1. Update "Last Updated" timestamp to current UTC+9 time
2. Add changelog entry at top of relevant section
3. Update affected technical details
4. Mark deprecated features/endpoints
5. Update code references if line numbers changed significantly

CHANGELOG FORMAT WITHIN DOCUMENT:
[2025-12-12 14:30 JST] Added support for 60-day lookback window
[2025-12-11 09:15 JST] Fixed port configuration to use 5000 consistently

=============================================================================
WRITING STYLE GUIDELINES
=============================================================================

DO:
- Use direct, technical language
- Include actual code snippets
- Specify exact file paths
- Provide line number references
- List concrete steps
- Use simple lists and sections
- Include configuration values
- Show example API calls

DO NOT:
- Use excessive markdown styling (###, **, >, etc.)
- Add unnecessary emojis or decorations
- Write lengthy prose paragraphs
- Use vague language ("might", "could", "perhaps")
- Skip technical details
- Omit file paths or line numbers
- Add marketing language

ACCEPTABLE MARKDOWN:
- Section dividers (===)
- Simple lists (-, 1.)
- Code blocks (```)
- File paths in plain text or code blocks
- Bold for IMPORTANT TERMS (sparingly)

AVOID:
- Multiple heading levels
- Blockquotes for emphasis
- Tables (use simple lists instead)
- Images (describe in text if needed)
- Links to external resources (include relevant info directly)

=============================================================================
TIMEZONE HANDLING
=============================================================================

ALWAYS USE: UTC+9 (Japan Standard Time / Osaka Time)

Format: YYYY-MM-DD HH:MM JST

Examples:
2025-12-12 14:30 JST
2025-01-05 09:15 JST

To get current JST time in PowerShell:
[System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'Tokyo Standard Time').ToString("yyyy-MM-dd HH:mm")

=============================================================================
EXAMPLE DOCUMENTATION FILE
=============================================================================

Created: 2025-12-12 14:30 JST
Last Updated: 2025-12-12 14:30 JST

REAL-TIME STOCK MONITORING SYSTEM

PURPOSE
Automated anomaly detection for 73 stocks across US, Japan, and Thailand markets with LINE and email notifications.

TECHNICAL IMPLEMENTATION

Key Files:
- backend-python/app/config/monitored_stocks.py (lines 1-100)
- backend-python/app/services/user_notifications.py (lines 1-470)
- backend-python/app/scheduler.py (lines 50-200)

API Endpoints:
POST /py/monitoring/run
Request: { "market": "US|JP|TH" }
Response: { "total_anomalies": 5, "tickers_scanned": 40 }

Database Collections:
- anomalies: stores detected anomalies with sent flag
- detection_runs: tracks scan history
- subscribers: user subscriptions to tickers

Configuration:
MONITORED_STOCKS = {
  "US": ["AAPL", "MSFT", ...],
  "JP": ["6758.T", ...],
  "TH": ["ADVANC.BK", ...]
}

Dependencies:
- yfinance for market data
- IsolationForest for anomaly detection
- LINE Bot API for notifications
- MongoDB for persistence

Notification Flow:
scheduler.py job_for_market() → train_service.py detect_anomalies() → user_notifications.py notify_users_of_anomalies() → LINE API + Email service

Known Limitations:
- 60-day lookback window for notifications
- Requires MongoDB connection for sent tracking
- LINE API rate limits apply

CHANGELOG
[2025-12-12 14:30 JST] Extended lookback from 30 days to 60 days
[2025-12-11 09:00 JST] Initial implementation with 73 stocks

=============================================================================
QUICK REFERENCE
=============================================================================

FILE LOCATIONS:
docs/specs/ - Technical specifications and architecture
docs/features/ - Individual feature documentation
docs/specs/API.md - All API endpoints
docs/specs/database-schema.md - Database structure
docs/specs/ARCHITECTURE.md - System architecture

TIMESTAMP FORMAT:
Created: YYYY-MM-DD HH:MM JST
Last Updated: YYYY-MM-DD HH:MM JST

CONTENT PRIORITY:
1. Technical accuracy
2. File paths and line numbers
3. Configuration values
4. Code examples
5. Concrete implementation details

MARKDOWN USAGE:
Keep minimal - focus on content over formatting

=============================================================================
