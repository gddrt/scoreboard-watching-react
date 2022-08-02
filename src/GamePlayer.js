import './GamePlayer.css';
import React from 'react';

import Scoreboard from './Scoreboard';
import GameList from './GameList';
import Controls from './Controls';

// Given a team "home" or "away" return the opposite
function oppTeam(team) {
    return team === 'home' ? 'away' : 'home';
}

class GameState {
    constructor(game) {
        // Accepts NHL live API response for complete game
        // Returns an object with information needed to generate events
        this.teams = game.gameData.teams;
        this.isPlayoffs = game.gameData.game.type === "P";
        this.gameDetail = this.getGameDetail(game);
        // Track whether to mirror coordinates. Some games have coordinates mirrored.
        this.mirrorCoordinates = false;
        this.hasPeriodEvents = game.liveData.plays.allPlays.reduce((acc, val) => {
            return acc || val.result.eventTypeId === 'PERIOD_START'
        }, false);
        this.season = game.gameData.game.season;
        // Overtime length has changed over time.
        // We add it to the game object in preprocessGame()
        // Fall back to 5 if it is missing.
        // Value is ignored for non-playoff games.
        this.overtimeLength = game.overtimeLength || 5;
        this.gamePk = game.gamePk;
        if (this.isPlayoffs) {
            // Parse playoff game data from game Pk parts
            // eg. 2019 03 01 1 5
            // 2019: season (2019-2020)
            // 03: game type code (03 = playoffs)
            // 01: round number
            // 1: series identifier
            // 5: game number
            const parts = game.gamePk.toString().match(/^(\d{4})03(\d{2})\d(\d)$/)
            let seriesName;
            switch(parts[2]) {
                case "00":
                    seriesName = "Play-In";
                    break;
                case "03":
                    if (parts[1] < "1974") seriesName = "Stanley Cup Final";
                    else seriesName = "Round 3";
                    break;
                case "04":
                    seriesName = "Stanley Cup Final";
                    break;
                default:
                    seriesName = "Round " + Number(parts[2]).toString();
            }
            let gameLabel = "Game " + Number(parts[3]).toString();
            this.playoffDescription = seriesName + ", " + gameLabel;
        }
    }

    getGameDetail(game) {
        let gameDetail = [];
        // formatting dates in javascript is hard
        // anyway this takes the game's start time (which is provided in GMT)
        // then subtracts 6 hours because we want the start date in eastern time
        // then picks out the date (without leading zero), month and year
        // then glues it all together
        //'Sun, 08 May 2022 17:00:00 GMT'
        try {
            let game_date = new Date( new Date(game.gameData.datetime.dateTime).getTime() - 3600000 * 6 ).toGMTString();
            let date_parts = game_date.match(/^\w+, 0?(\d{1,2}) (\w+) (\d+)/);
            gameDetail.push(date_parts[2] + ' ' + date_parts[1] + ', ' + date_parts[3]);
        } catch(e) {
            // I told you it was hard.
            console.warn(e);
        }
        try {
            gameDetail.push(game.gameData.venue.name);
        } catch(e) {
            console.warn(e);
        }

        return gameDetail.join(' - ');
    }
}

class PenaltyManager {
    constructor(home, away) {
        this.penalties = {
            'home': [],
            'away': []
        }
        this.teams = {home, away}
    }

    /**
     * Add a penalty and keep track
     * team: home or away
     * ts: seconds timestamp
     * minutes (optional): length of penalty, default 2
     * isMajor (optional): default false.
     */

    assess(team, ts, minutes, isMajor) {
        // Remove expired
        this.cleanUp(ts);

        // default 2 minute minor penalty
        const seconds = minutes ? minutes * 60 : 120;
        isMajor = !!isMajor;

        let newPenalty = [isMajor, ts + seconds];
        // if a penalty with the same parameters exists for the other team, they are offsetting
        // remove that penalty and do not add this one
        const opp = oppTeam(team);
        for (let i=0; i<this.penalties[opp].length; i++) {
            const oldPenalty = this.penalties[opp][i];
            // crude but simple way of comparing
            if (JSON.stringify(newPenalty) === JSON.stringify(oldPenalty)) {
                this.penalties[opp].splice(i, 1);
                newPenalty = false;
                break;
            }
        }

        // after checking, we still have a new penalty to add, so do that.
        if (newPenalty) {
            this.penalties[team].push(newPenalty);
        }
    }

    /**
     * When a goal is scored, check if a penalty should be removed.
     * We only remove a penalty if there is no current numerical advantage
     * and there is a minor penalty in progress
     */
    goal(team, ts) {
        let advState = this.getAdvantageState(ts);

        // Do nothing if there is no advantage, or the scoring team is not advantaged
        if (!advState || advState.team !== team) return;

        // Track the current candidate penalty to remove
        let candidate;
        // Track the duration. It's not quite as simple as taking the one with the nearest
        // expires time. For instance, if a double minor expires in 2:01, it's considered
        // 1 second left in the original penalty and the PP timer is set to 2:00.
        let candidateDuration;
        this.penalties[oppTeam(team)].forEach((x) => {
            // if no candidate yet, use it
            if (!candidate && !x[0]) {
                candidate = x;
                candidateDuration = (x[1] - 1 - ts) % 120;
            } else {
                // replace candidate if not major and expires sooner
                let penDuration = (x[1] - 1 - ts) % 120;
                if (!x[0] && penDuration < candidateDuration) candidate = x;
            }
        });

        // Bit of a hack. arrays are stored by reference. we will manually expire
        // the referred penalty and then clean it up.
        if (candidate) {
            let fullPenaltiesLeft = Math.floor((candidate[1] - ts - 1) / 120);
            candidate[1] = ts + fullPenaltiesLeft * 120;
            this.cleanUp(ts);
        }
    }

    /**
     * Remove any penalties that may be expired
     */
    cleanUp(ts) {
        ['home', 'away'].forEach((x) => {
            this.penalties[x] = this.penalties[x].filter(y => y[1] > ts)
        })
    }

    /**
     * Given a timestamp, get the current advantage state
     * Returns: false, or
     * {
     *  'team': (home or away),
     *  'type': (PP or 5v3),
     *  'exp': (Timestamp when status will change)
     * }
     */
    getAdvantageState(ts) {
        // First remove any expired penalties
        this.cleanUp(ts);

        // Track when the state is expected to change
        let changeTime;
        let penaltyCount = {'home': 0, 'away': 0}
        Object.keys(penaltyCount).forEach((x) => {
            this.penalties[x].forEach((y) => {
                changeTime = changeTime ? Math.min(changeTime, y[1]) : y[1];
                penaltyCount[x] += 1;
            })
        });

        let diff = penaltyCount['home'] - penaltyCount['away'];

        // No penalties
        if (diff === 0) return false;

        let ret = {
            'team': diff > 0 ? 'away' : 'home',
            'triCode': diff > 0 ? this.teams.away : this.teams.home,
            'type': Math.abs(diff) === 1 ? 'PP' : '5v3',
            'exp': changeTime,
        };
        let timeLeft = changeTime - ts;
        let mins = Math.floor(timeLeft / 60);
        let secs = (timeLeft % 60).toString().padStart(2, '0');
        ret['clock'] = `${mins}:${secs}`;

        return ret;
    }

    load(penaltyInfo) {
        this.penalties = JSON.parse(JSON.stringify(penaltyInfo));
    }

    dump() {
        return JSON.parse(JSON.stringify(this.penalties));
    }
}

class BaseGameEvent {
    init(gameState) {
        // Set stoppage duration depending on event type
        switch(this.eventTypeId) {
            case "PERIOD_END":
            case "PERIOD_START":
                this.stoppageTime = 2500;
                break;
            case "STOP":
                this.stoppageTime = 1000;
                this.minorStoppage = true;
                break;
            case "PENALTY":
                this.stoppageTime = 2500;
                break;
            case "GOAL":
            case "CHALLENGE":
            case "TIMEOUT": // Timeout isn't real, it's recorded as STOP, but anyway
                this.stoppageTime = 5000;
                break;
            default:
                break;
        }

    }

    isShot() {
        // Whether this event counts as a shot on goal
        return ["GOAL", "SHOT"].includes(this.eventTypeId);
    }

    isShotAttempt() {
        // Whether this event counts as a shot attempt
        return this.isShot() || ["BLOCKED_SHOT", "MISSED_SHOT"].includes(this.eventTypeId);
    }

    isOvertime() {
        // Whether this event occured in overtime
        return this.timeElapsed > 3600;
    }

    setScore(score) {
        // Deep copy given score blob and save it
        this.score = JSON.parse(JSON.stringify(score));
    }

}

class GameEvent extends BaseGameEvent {
    constructor(gameState, params) {
        super();

        // params: one-dimensional object with params to set.
        // REQUIRED params:
        // timeElapsed, eventTypeId
        // OPTIONAL params:
        // triCode, coordinates {'x': 0, 'y': 0}

        // Whether this is an actual event from the NHL API
        // You should use APIGameEvent for that instead.
        this.isReal = false;

        // dummy penaltyInfo
        this.penaltyInfo = {'home': [], 'away': []}

        Object.keys(params).forEach((x) => {
            this[x] = params[x];
        });

        // Common additional setup after class properties have been defined
        this.init(gameState);
    }
}

class APIGameEvent extends BaseGameEvent {
    constructor(gameState, event) {
        super();

        // Accepts a liveData.plays object from NHL live API
        // Converts that into our GameEvent

        // Whether this is an actual event from the NHL API
        this.isReal = true;

        // triCode: team triCode for the event
        // team: 'home', 'away', or false for neutral events
        this.triCode = event.team?.triCode;
        if (!this.triCode) this.team = false;
        else {
            this.team = event.team.triCode === gameState.teams.home.triCode ? 'home' : 'away';
        }
        this.isHome = event.team?.triCode === gameState.teams.home.triCode;

        // The NHL API credits blocked shots to the blocking team
        // However we would like them credited to the shooting team to count shots
        if (event.result.eventTypeId === "BLOCKED_SHOT") {
            this.isHome = !this.isHome;
            this.team  = event.team.triCode === gameState.teams.home.triCode ? 'away' : 'home';
        }

        // Track if a shot hits the post. This is only recorded in the event description.
        // Hopefully there is never a player with the name Goalpost or Crossbar.
        if (event.result.eventTypeId === "MISSED_SHOT") {
            ["Goalpost", "Crossbar"].forEach((x) => {
                if (event.result.description?.includes(x)) {
                    this.specialAnim = this.isHome ? 'PING_HOME' : 'PING_AWAY';
                }
            })
        }

        this.eventTypeId = event.result.eventTypeId;
        // Special case
        if (event.result.eventTypeId === "STOP" && event.result.description.includes("Timeout")) {
            this.eventTypeId = "TIMEOUT";
        }
        this.description = event.result.description;
        this.timeElapsed = this.getTimeElapsed(event);
        // Regular season games have limited overtime
        if (!gameState.isPlayoffs) {
            const maxTime = (60 + gameState.overtimeLength) * 60;
            this.timeElapsed = Math.min(maxTime, this.timeElapsed);
        }
        this.coordinates = event.coordinates;
        this.period = event.about.period;

        // Mark if this event is a penalty shot being assessed
        if (event.result.eventTypeId === "PENALTY" && event.result.penaltySeverity === "Penalty Shot") {
            this.isPenaltyShot = true;
        }

        // Mark if this occurs in a shootout
        if (event.about.periodType === "SHOOTOUT") this.isShootout = true;

        // Save raw event data
        this.raw = event;

        // Common additional setup after class properties have been defined
        this.init(gameState);
    }

    getTimeElapsed(event) {
        // Given an API event, calculate seconds elapsed
        let timeParts = event.about.periodTime.match(/(\d+):(\d+)/);
        let minutes = (event.about.period - 1) * 20 + Number(timeParts[1]);
        let seconds = Number(timeParts[2]);
        return minutes * 60 + seconds;
    }
}

class GamePlayer extends React.Component {
    constructor(props) {
        super(props);
        let userPrefs = {};
        try {userPrefs = JSON.parse(window.localStorage.getItem('preferences'));}
        catch (e) { console.warn(e); }

        this.state = {
            gameLoadingState: 0, // 0 not loaded, 1 error, 2 downloading, 3 init, 4 ready
            game: false,
            score: this.getInitialScore(),
            timeElapsed: 0,
            period: 1,
            isPlaying: false,
            playbackSpeed: userPrefs?.playbackSpeed || 40,
            pauseOnAllStoppages: userPrefs?.pauseOnAllStoppages !== undefined ? userPrefs.pauseOnAllStoppages : true,
            eventLabel: '',
            coordinates: {x: 0, y: 0}, // puck coordinates. 90,45 is center ice.
            penaltyInfo: false,
            fastForward: false,
        }

        // Bind functions
        this.downloadGame = this.downloadGame.bind(this);
        this.pause = this.pause.bind(this);
        this.play = this.play.bind(this);
        this.adjustSpeed = this.adjustSpeed.bind(this);
        this.setProgress = this.setProgress.bind(this);
        this.setStoppageSetting = this.setStoppageSetting.bind(this);
        this.savePrefs = this.savePrefs.bind(this);
        this.fastForward = this.fastForward.bind(this);

        // Minimum ms between ticks, to ensure smooth playback at any speed choice.
        this.PLAYBACK_RATE_CAP = 20;
    }

    componentDidMount() {
        // If a game is specified in the hash, load that game immediately
        // Then remove the hash from the address bar
        const hashMatch = window.location.hash?.match(/^#game:(\d{10})/)
        if (hashMatch) {
            let curUrl = new URL(window.location.href);
            curUrl.hash = '';
            window.history.replaceState({}, '', curUrl);
            this.downloadGame(hashMatch[1]);
        }
    }

    savePrefs() {
        window.localStorage.setItem('preferences', JSON.stringify({
            playbackSpeed: this.state.playbackSpeed,
            pauseOnAllStoppages: this.state.pauseOnAllStoppages
        }));
    }

    getInitialScore() {
        // Generate and return a new score object
        return JSON.parse(JSON.stringify({
            'home': {'goals': 0, 'shots': 0, 'shotAttempts': 0},
            'away': {'goals': 0, 'shots': 0, 'shotAttempts': 0}
        }));
    }

    unloadGame() {
        // Unload a game
        this.pause();
        this.setState({gameLoadingState: 0});
    }

    pause() {
        if (this.interval) {
            window.clearInterval(this.interval);
            this.interval = false;
        }
        this.setState({isPlaying: false, fastForward: false});
    }

    play() {
        const interval = Math.max(this.PLAYBACK_RATE_CAP, this.state.playbackSpeed);
        if (this.interval) window.clearInterval(this.interval);
        this.interval = window.setInterval(this.step.bind(this), interval);
        this.setState({isPlaying: true, fastForward: false});
    }

    downloadGame(gamePk) {
        /**
         * fetch game then call loadGame
         */
        this.unloadGame();
        this.setState({gameLoadingState: 2});
        fetch('https://statsapi.web.nhl.com/api/v1/game/' + gamePk.toString() + '/feed/live')
        .then((r) => {
            return r.json();
        })
        .then((j) => {
            this.setState({gameLoadingState: 3});
            this.loadGame(j);
        })
        .catch((e) => {
            console.error(e);
            this.setState({gameLoadingState: 1});
        });
    }

    preprocessGame(game) {
        /**
         * Fix missing/broken attributes in json response
         * (Some older games)
         */
         if (!game.gameData.teams.away.triCode) game.gameData.teams.away.triCode = game.gameData.teams.away.abbreviation || game.gameData.teams.away.name.replace(/[^A-Z]/,'') || 'AWAY';
         if (!game.gameData.teams.home.triCode) game.gameData.teams.home.triCode = game.gameData.teams.home.abbreviation || game.gameData.teams.home.name.replace(/[^A-Z]/,'') || 'HOME';

         game.overtimeLength = game.gameData.game.season >= "19831984" ? 5 : 10;
    }

    preprocessEvents(game) {
        /**
         * Given a game json response, generate game events from it.
         */

        // Create an object with information we need to generate events
        const GS = new GameState(game);

        this.evpm = new PenaltyManager(GS.teams.home.triCode, GS.teams.away.triCode);
        const PM = new PenaltyManager();

        // Generate events from NHL data
        let baseEventList = game.liveData.plays.allPlays.map((x) => {
            return new APIGameEvent(GS, x);
        });

        // We will manipulate and maybe re-order them
        let eventList = [];

        let scorers = {};

        // Some games have coordinate information mirrored for some reason.
        // We will attempt to guess which ones by counting how many shots and goals
        // occur at the expected end of the ice.
        // We expect most shot attempts will happen on the side closest to the attacking goal.
        let orientation = {'right': 0, 'wrong': 0}

        // API does not indicate whether a shot event happened on a penalty shot
        // Track it manually -- we want to add a pause for the drama
        let isPenaltyShot = false;
        let score = this.getInitialScore();

        // If we need to fake the period start/end events, track our current position
        let falseEventPeriod = 1;

        if (!GS.hasPeriodEvents) {
            let nev = new GameEvent(GS, {
                    eventTypeId: 'PERIOD_START',
                    description: 'Period Start',
                    period: 1,
                    timeElapsed: 0
                })
            nev.setScore(score);
            eventList.push(nev);
        }

        let shootoutFirstShooter;

        // Store a snapshot of the last penalty info
        // This is because when multiple penalties are added at once, we do not
        // want to update the PP clock until they are all accounted for.
        let lastPenaltyInfo = PM.dump();

        for(let i=0; i<baseEventList.length; i++) {
            const ev = baseEventList[i];
            let mockEvent;

            // Do not track certain events
            if (["PERIOD_READY", "GAME_SCHEDULED", "PERIOD_OFFICIAL"].includes(ev.eventTypeId)) continue;

            // Ignore penalty events from the 1943 season and earlier as these do not have timestamps
            if (GS.season <= "19431944" && ev.eventTypeId === "PENALTY") continue;

            if (!GS.hasPeriodEvents && ev.period > falseEventPeriod) {
                while(falseEventPeriod < ev.period) {
                    let ts = falseEventPeriod * 1200;
                    if (!GS.isPlayoffs) {
                        let gameLength = (60 + GS.overtimeLength) * 60;
                        ts = Math.min(gameLength, ts);
                    }
                    let nev = new GameEvent(GS, {
                        eventTypeId: 'PERIOD_END',
                        description: 'Period End',
                        period: falseEventPeriod,
                        timeElapsed: ts
                    });
                    
                    nev.setScore(score);
                    eventList.push(nev);
                    nev = new GameEvent(GS, {
                        eventTypeId: 'PERIOD_START',
                        description: 'Period Start',
                        period: falseEventPeriod + 1,
                        timeElapsed: ts
                    });
                    nev.setScore(score);
                    eventList.push(nev);
                    falseEventPeriod++;
                }
            }
            // Mock location for period start
            if (ev.eventTypeId === "PERIOD_START") {
                ev.coordinates = {x: 0, y: 0}
            }

            // Initialize shootout
            if (ev.isShootout && score.home.shootoutState === undefined) {
                score.home.shootoutState = [];
                score.away.shootoutState = [];
            }

            if (ev.coordinates && ev.isShotAttempt()) {
                // expected shooting side is left for home, right for visitor
                let expected_side = ev.isHome ? -1 : 1;
                // sides are flipped in even periods
                if (ev.period % 2 === 0) expected_side *= -1;
                // if x coordinate times expected_side value is positive, we are correct
                if (expected_side * ev.coordinates.x < 0) orientation.wrong += 1;
                else orientation.right += 1;
            }

            // If the prior play was a penalty shot being assessed, 
            // pause a bit on the next shot
            if (ev.isShotAttempt() && isPenaltyShot) {
                isPenaltyShot = false;
                ev.stoppageTime = 5000;
            }

            if (ev.isPenaltyShot) isPenaltyShot = true;

            // Manage shot/goal counts
            if (ev.isShotAttempt()) score[ev.team]['shotAttempts'] += 1;
            if (ev.isShot()) score[ev.team]['shots'] += 1;
            if (ev.eventTypeId === "GOAL") score[ev.team]['goals'] += 1;

            // Shootout management
            // First, before each shot, we want to insert an event to announce the shooter
            // Then we want to update the shootout state
            if (ev.isShootout && (ev.isShot() || ev.isShotAttempt())) {
                if (!shootoutFirstShooter) shootoutFirstShooter = ev.team;
                let shooterName;
                try {
                    shooterName = ': ' + ev.raw.players.filter((x) => {return ["Shooter", "Scorer"].includes(x.playerType)})[0].player.fullName;
                } catch(e) {
                    console.warn(e);
                }

                let ge_params = {
                    eventTypeId: 'SHOOTOUT_SHOOTER_READY',
                    team: ev.team,
                    description: GS.teams[ev.team].locationName + ' shooter' + shooterName,
                    timeElapsed: ev.timeElapsed,
                    coordinates: {x: 0, y: 0},
                    stoppageTime: 2500
                }
                // add blank square(s) if this team is shooting first
                if (ev.team === shootoutFirstShooter) {
                    score.home.shootoutState.push('-');
                    score.away.shootoutState.push('-');
                }

                let ge = new GameEvent(GS, ge_params);
                ge.setScore(score);
                mockEvent = ge;

                // Now update shootout state
                // Remove 'blank' square to be replaced with result
                score[ev.team].shootoutState.pop();
                if (ev.eventTypeId === "GOAL") {
                    score[ev.team].shootoutState.push('O');
                    // Use default goal stoppage time
                } else {
                    score[ev.team].shootoutState.push('X');
                    ev.stoppageTime = 2500;
                }
            }

            // Manage penalty info
            if (ev.eventTypeId === 'GOAL') {
                PM.goal(ev.team, ev.timeElapsed)
            } else if (ev.eventTypeId === 'PENALTY') {
                // Ignore penalty shots and misconducts
                const pims = ev.raw.result.penaltyMinutes;
                // "Major" penalties are ones that do not expire on goals
                // (as far as this app is concerned)
                // Before 56-57, minor penalties were like that too.
                if (pims > 0 && pims <= 5) {
                    PM.assess(
                        ev.team,
                        ev.timeElapsed,
                        pims,
                        (GS.season < '19561957' || ev.raw?.result?.penaltySeverity === 'Major')
                    )
                }
            }
            ev.setScore(score);

            PM.cleanUp(ev.timeElapsed);
            // If next event is a penalty at the same time, attach old info
            // We don't want to display the clock until all penalties have been assessed
            // Length check is probably not necessary as the game wouldn't end on a penalty,
            // but just in case.
            if (ev.eventTypeId !== 'PENALTY' ||
                i+1 >= baseEventList.length ||
                !(baseEventList[i+1].eventTypeId === 'PENALTY' && baseEventList[i+1].timeElapsed === ev.timeElapsed))
            { lastPenaltyInfo = PM.dump(); }
            ev.penaltyInfo = lastPenaltyInfo;

            // Track hat tricks
            // Ignores shootout goals, probably. Make sure that 2005 data has event.about.periodType
            if (ev.eventTypeId === "GOAL" && ev.raw.about.periodType !== "SHOOTOUT" && ev.raw.players) {
                for(let i=0; i<ev.raw.players.length; i++) {
                    if (ev.raw.players[i].playerType !== 'Scorer') continue;

                    let pid = 'p' + ev.raw.players[i].player.id.toString();
                    if (!scorers.hasOwnProperty(pid)) scorers[pid] = 1;
                    else {
                        scorers[pid] += 1;
                        if (scorers[pid] === 3) {
                            ev.specialAnim = ev.isHome ? 'HAT_TRICK_HOME' : 'HAT_TRICK_AWAY'
                        }
                    }
                }
            };


            // API doesn't really care about logical ordering, game events that are recorded at the same
            // time in game time can be ordered in any way, even though it doesn't make sense to have one first.
            // Detect and transpose these cases.

            // Ensure "Goal" comes before "Period End" for overtime goals
            const overtimeGoalLast = (
                (
                    (ev.isOvertime() && ev.eventTypeId === 'GOAL')
                    || (ev.isShootout
                        && (ev.eventTypeId === 'GOAL' || ev.isShotAttempt()))
                )
                && eventList.length > 0
                && eventList[eventList.length-1].eventTypeId === 'PERIOD_END'
            );
            // Ensure "Goal" comes before "Timeout" when timeout is called on the same second.
            const timeoutLast = (
                ev.eventTypeId === 'GOAL'
                && eventList.length > 0
                && eventList[eventList.length-1].eventTypeId === 'TIMEOUT'
            );
            if (
                (overtimeGoalLast || timeoutLast)
                && (ev.timeElapsed === eventList[eventList.length-1].timeElapsed)
             ) {
                const oldEvent = eventList.pop();
                if (mockEvent) eventList.push(mockEvent);
                eventList.push(ev);
                oldEvent.setScore(score);
                eventList.push(oldEvent);
            }
            else {
                if (mockEvent) eventList.push(mockEvent);
                eventList.push(ev);
            }

            // Add a fake Faceoff event after goals for old games that don't have
            // detailed event data. This clears the goal animation.
            if (!GS.hasPeriodEvents && ev.eventTypeId === 'GOAL' && !ev.isOvertime()) {
                let nev = new GameEvent(GS, {
                    eventTypeId: 'FACEOFF',
                    description: 'Faceoff',
                    timeElapsed: ev.timeElapsed,
                    coordinates: {x: 0, y: 0},
                    penaltyInfo: lastPenaltyInfo
                })
                nev.setScore(score);
                eventList.push(nev);
            }
        }

        // Push remaining false period start/end events if needed
        if (!GS.hasPeriodEvents) {
            let lastPeriod = 3;
            if (score.home.goals === score.away.goals) {
                lastPeriod = 4;
            }
            while(falseEventPeriod < lastPeriod ) {
                let nev = new GameEvent(GS, {
                    eventTypeId: 'PERIOD_END',
                    description: 'Period End',
                    period: falseEventPeriod,
                    timeElapsed: falseEventPeriod * 1200
                });
                nev.setScore(score)
                eventList.push(nev);
                nev = new GameEvent(GS, {
                    eventTypeId: 'PERIOD_START',
                    description: 'Period Start',
                    period: falseEventPeriod + 1,
                    timeElapsed: falseEventPeriod * 1200
                });
                nev.setScore(score);
                eventList.push(nev);
                falseEventPeriod++;
            }

            // If the last event is a goal in overtime, then the last Period End
            // needs to take place at the time of the goal
            // Otherwise it would be at the end of the last period
            let params = {
                eventTypeId: 'PERIOD_END',
                description: 'Period End',
                period: 3,
                timeElapsed: 3600
            }
            if (eventList[eventList.length - 1].period === 4) {
                params.period = 4;
                if (eventList[eventList.length - 1].eventTypeId === "GOAL") {
                    params.timeElapsed = eventList[eventList.length - 1].timeElapsed;
                } else {
                    params.timeElapsed = (60 + GS.overtimeLength)*60;
                }
            }
            let nev = new GameEvent(GS, params);
            nev.setScore(score);
            eventList.push(nev);
        }

        // indicate that visual coordinates should be flipped
        if (orientation.wrong > orientation.right) {
            GS.mirrorCoordinates = true;
        }
        this.events = eventList;
        this.setState({game: GS});
    }

    loadGame(game) {
        /**
         * Initialize a game from an API JSON response
         */

        // Set certain values upon loading a game
        this.stoppageTime = 0;
        this.nextIndex = 0;

        this.preprocessGame(game);

        this.preprocessEvents(game);

        this.setState({
            gameLoadingState: 4,
            coordinates: {x: 0, y: 0},
            timeElapsed: 0,
            period: 1,
        });

        // If this is called immediately, it doesn't quite work, so set a short timeout
        window.setTimeout(_=>document.getElementById('player').scrollIntoView(), 50);

        this.play();
    }

    step() {
        // If we have reached the end of event queue,
        // stop playback.
        if (this.nextIndex >= this.events.length) {
            this.pause();
            return;
        }

        // If fast forward button is held, increase speed up to 10 times, up to the cap
        let playbackSpeed = this.state.playbackSpeed;
        if (this.state.fastForward) {
            playbackSpeed = Math.max(1, playbackSpeed / 10);
        }

        // If we have stopped for a stoppage, just decrement that instead of doing something
        if (this.stoppageTime > 0) {
            let stoppageTimeDown = Math.max(20, playbackSpeed);
            if (this.state.fastForward) stoppageTimeDown *= 10;
            this.stoppageTime -= stoppageTimeDown;
            return;
        }

        // If it is not yet time for a new event, step up time first
        let timeElapsed = this.state.timeElapsed;
        if (timeElapsed < this.events[this.nextIndex].timeElapsed) {
            timeElapsed += Math.max(1, Math.floor(this.PLAYBACK_RATE_CAP/playbackSpeed));
        }

        // Then check if it is time for a new event
        if (timeElapsed >= this.events[this.nextIndex].timeElapsed) {
            this.doEvent(this.events[this.nextIndex]);
            this.nextIndex++;
            if (this.nextIndex >= this.events.length) {
                this.setState({isPlaying: false});
                window.clearInterval(this.interval);
                this.interval = false;
            }
            return;
        }

        // Sanity check period and timeElapsed. period should be incremented by the event.
        let period = this.state.period;
        // If time is a multiple of 1200, the end of one period and beginning of the next are valid.
        if (timeElapsed > 0 && timeElapsed % 1200 === 0) {
            let candidates = [Math.ceil(timeElapsed/1200), Math.ceil((timeElapsed + 1) / 1200)];
            if (!candidates.includes(this.state.period)) period = Math.floor(timeElapsed/1200);
        } else {
            period = Math.floor(timeElapsed / 1200) + 1;
        }

        this.setState({
            timeElapsed: timeElapsed,
            period: period,
            penaltyInfo: this.evpm.getAdvantageState(timeElapsed)
        });
    }

    doEvent(gameEvent, ts) {
        /**
         * Do a GameEvent
         * ts: optional, timestamp to set after doing the event
         */

        // wipe the event description if we are skipping well past
        // the last event. also don't pause if there was a stoppage.
        let description = gameEvent.description;
        let stoppageTime = gameEvent.stoppageTime;
        if (ts !== undefined) {
            if (ts - gameEvent.timeElapsed > 10) {
                description = '';
                stoppageTime = 0;
            }
        } else {
            ts = gameEvent.timeElapsed;
        }

        // Define event label
        let eventLabel = gameEvent.eventTypeId;
        if (gameEvent.eventTypeId === 'GOAL') {
            eventLabel = gameEvent.isHome ? 'GOAL_HOME' : 'GOAL_AWAY';
        }

        this.evpm.load(gameEvent.penaltyInfo);

        // Update the scoreboard state
        let stateUpdate = {
            score: gameEvent.score,
            timeElapsed: ts,
            description: description,
            eventLabel: eventLabel,
            specialAnim: gameEvent.specialAnim,
            penaltyInfo: this.evpm.getAdvantageState(ts)
        }
        if (gameEvent.coordinates?.x !== undefined) stateUpdate.coordinates = gameEvent.coordinates;
        if (gameEvent.period) stateUpdate.period = gameEvent.period;

        this.setState(stateUpdate);

        if (gameEvent.stoppageTime && (!gameEvent.minorStoppage || this.state.pauseOnAllStoppages)) {
            this.stoppageTime = stoppageTime;
        } else {
            this.stoppageTime = 0;
        }
    }

    adjustSpeed(dir) {
        /**
         * Speed up or slow down the game
         */
        const SPEEDS = [4, 5, 6, 8, 10, 12, 15, 20, 25, 33, 40, 50, 67, 80, 100, 125, 200, 250, 333, 500, 1000];
        let speed_index = SPEEDS.indexOf(this.state.playbackSpeed)
        if (speed_index === -1) speed_index = SPEEDS.indexOf(20);

        if (dir === 'up' && speed_index > 0) speed_index--;
        else if (dir === 'down' && speed_index < SPEEDS.length - 1) speed_index++;
        else return;

        this.setState(
            {playbackSpeed: SPEEDS[speed_index]}, ()=>{
                if (this.state.isPlaying) {
                    this.pause();
                    this.play();
                }
                this.savePrefs();
            }
        )
    }

    setProgress(value) {
        /**
         * Set game scroll progress
         */

        value = Number(value);

        let idx;
        for (idx=1; idx<this.events.length; idx++) {
            if (this.events[idx].timeElapsed >= value) {
                break;
            }
        }

        this.stoppageTime = 0;
        this.nextIndex = idx;
        this.doEvent(this.events[idx-1], value);
    }

    setStoppageSetting(value) {
        this.setState({
            pauseOnAllStoppages: !value
        }, this.savePrefs);
    }

    fastForward(value) {
        this.setState({
            fastForward: value
        })
    }

    // Controls are hidden if game is not loaded and ready
    render() {
        return (
        <>
        <div id="player" className="player-container">
            <Scoreboard
                gameLoadingState={this.state.gameLoadingState}
                game={this.state.game}
                score={this.state.score}
                coordinates={this.state.coordinates}
                timeElapsed={this.state.timeElapsed}
                period={this.state.period}
                eventLabel={this.state.eventLabel}
                description={this.state.description}
                specialAnim={this.state.specialAnim}
                penaltyInfo={this.state.penaltyInfo}
            />
            {this.state.gameLoadingState === 4 && <Controls
                playbackSpeed={this.state.playbackSpeed}
                isPlaying={this.state.isPlaying}
                pauseOnAllStoppages={this.state.pauseOnAllStoppages}
                timeElapsed={this.state.timeElapsed}
                adjustSpeed={this.adjustSpeed}
                setProgress={this.setProgress}
                setStoppageSetting={this.setStoppageSetting}
                pause={this.pause}
                play={this.play}
                fastForward={this.fastForward}
            />}
        </div>
        <GameList downloadGame={this.downloadGame} />
        </>)
    }
}

export default GamePlayer;