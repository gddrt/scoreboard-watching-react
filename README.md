# Scoreboard Watching
An app that aims to recreate the excitement of watching a live game, at least a little bit, when you've missed all or part of it. More fun than checking the scores page. Spoiler-free.

## Development
It's a create-react-app thing so `npm start` to launch a test server and `npm run build` to build for export.

## Reporting Issues
Feel free to open an issue for anything that is wrong, no matter how minor you think it is. Maybe it's too small and difficult to fix but it's good to record it anyway. Please include a link to the game and the timestamp where the issue happens.

## Known Issues
### That could probably be fixed by very smart and talented people
* All regular season games before 1983 use 10-minute sudden-death overtime -- the earlier overtime rules are not implemented. (This is probably simple, I'll fix it eventually.)
* Certain special games (such as All-star games) appear in the games list but break the app. I'll probably just filter these out, not sure if they actually have enough data to replay.
* Unusual penalty situations may not be recorded correctly (For instance, as written the app would be unable to record a minor penalty taken by a team that is currently shorthanded by two major penalties, and have it correctly start after a major penalty has lapsed.)
* 4 on 4 and 3 on 3 situations are not displayed because I wasn't sure how to do that accurately -- I don't really understand all the nuances in offsetting minor penalties -- but I'm sure it's technically possible.
* "Video review" events are shown and spoil things somewhat. Ideally, whenever there is a video review event, I'd like to precede it with a "Apparent (TEAM) Goal" event and follow it with the review result. But video review is not just for goals anymore (it can be used to review double-minor penalties), so maybe it's not possible. Anyway, this should be better somehow.
### That can't be helped
* Games prior to 1943 do not have penalty events. This is because, while those events are recorded in the game log, their time isn't. So the player removes those events rather than displaying them all at once.
* Empty net situations are not recorded in the live events, so there's no way to display that.
* The game list uses the scheduled time to determine if a game is playable or not, this may not be correct if the game is delayed or postponed. I used to use the game status code from the NHL API, and this worked well up until some point in the 2022 playoffs where it would indicate the game had not started despite being nearly complete. Not sure if that was a temporary glitch or a permanent change, I guess we'll see next season.

## Sources
All graphics are original work. Yes even the ice rink, that was a big pain to make (Did you know the neutral zone is that small? It looks much bigger on TV.)

If you have a better and free-to-use rink image, or even accurate diagrams of past rink dimensions, please let me know. The diagrams in the NHL Rulebooks are excellent but I haven't been able to find copies of historic rulebooks. I'd like to incorporate more older rinks eventually.

## Contact me
Twitter: [@gddrt_](https://twitter.com/gddrt_)
Email: [scoreboard@gddrt.com](mailto:scoreboard@gddrt.com)
