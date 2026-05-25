# Twitter/X Navigation Context

## Profile Page
- Profile URL pattern: `x.com/{handle}` or `twitter.com/{handle}`
- Follow button in the profile header
- DM button (envelope icon) if DMs are open
- Posts tab shows recent tweets

## Replying to a Tweet
1. Navigate to the specific tweet URL: `x.com/{handle}/status/{tweet_id}`
2. Click "Reply" button (speech bubble icon) under the tweet
3. Reply composer opens
4. Type reply text (280 char max)
5. Click "Reply" button to submit
6. Reply appears in the thread

## Sending a DM
1. Navigate to `x.com/messages`
2. Click "New message" (envelope + icon)
3. Search for the target by name or handle
4. Select the target from results
5. Type message in the compose box
6. Click send (paper plane icon)
7. Note: DMs only work if target has DMs open or follows you

## Posting a Tweet (mentioning someone)
1. Navigate to `x.com/compose/tweet` or click the compose button
2. Type tweet text including `@{handle}`
3. Click "Post"
4. 280 character limit

## Searching for a User
1. Navigate to `x.com/search`
2. Type the person's name
3. Click "People" tab to filter
4. Look for matching name + bio

## Common Failures
- **Login wall**: X requires login for most actions → flag and ask user to log in
- **DMs closed**: Many users don't accept DMs from non-followers → note in log
- **Rate limiting**: X is aggressive about rate limits → space actions out
- **Account suspension risk**: Don't spam mentions or replies → keep it genuine
- **Tweet not found**: May be deleted → skip and note

## Selectors (may change — verify at runtime)
- Reply button: `[data-testid="reply"]`
- Reply input: `[data-testid="tweetTextarea_0"]`
- Send reply: `[data-testid="tweetButton"]`
- DM input: `[data-testid="dmComposerTextInput"]`
- DM send: `[data-testid="dmComposerSendButton"]`
