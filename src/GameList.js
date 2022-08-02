import './GameList.css';
import yearGames from './yearGames.json';

import React from 'react';

class GameList extends React.Component {
    constructor(props) {
        super(props);
        this.defaultDate = this.getDefaultDate();
        this.state = {
            message: "Loading schedule...",
            games: [],
            date: this.defaultDate
        };
        this.getGames = this.getGames.bind(this);
        this.adjustDate = this.adjustDate.bind(this);
        this.minDate = "1917-12-20";
        this.maxDate = this.getDateString( new Date(new Date().getTime() + 86000 * 1000 * 7) ); // one week ahead
    }

    getDateString(dt) {
        // Given a Date(), return YYYY-MM-DD string
        return dt.getUTCFullYear().toString() + '-' + (dt.getUTCMonth() + 1).toString().padStart(2, '0') + '-' + dt.getUTCDate().toString().padStart(2, '0');
    }
    getDefaultDate() {
        // Load "current" date's games (actually, UTC date - 16 hours). We don't want to
        // show a list of games that are upcoming and can't be played.
        // This means the day turns over at about 4PM Eastern Time.
        let dt = new Date( new Date().getTime() - (20 * 3600 * 1000) );
        return this.getDateString(dt);
    }
    componentDidMount() {
        this.getGames(this.getDefaultDate());
    }

    adjustDate(val) {
        let curDate = new Date(this.state.date);
        if (val === 'up') {
            curDate.setDate(curDate.getDate() + 1)
        } else if (val === 'down') {
            curDate.setDate(curDate.getDate() - 1)
        } else {
            this.getGames(this.defaultDate);
            return;
        }
        this.getGames(this.getDateString(curDate));
    }

    getGames(dateString) {
        // Check if date is valid
        let msg = false;
        let testDate = new Date(dateString);
        if (!dateString.match(/\d{4}-\d{2}-\d{2}/) || isNaN(testDate)) {
            msg = "Please enter a valid date in YYYY-MM-DD format.";
        } else if (testDate < new Date(this.minDate) || testDate > new Date(this.maxDate)) {
            msg = "Please enter a date between " + this.minDate + " and " + this.maxDate + ".";
        }
        if (msg) {
            this.setState({
                date: dateString,
                message: msg
            });
            return;
        }

        this.setState({
            date: dateString,
            message: "Loading schedule..."
        });
        fetch("https://statsapi.web.nhl.com/api/v1/schedule?date=" + dateString + '&expand=round.series,schedule.game.seriesSummary')
        .then((r) => {
            return r.json();
        })
        .then((j) => {
            // Return empty list of no games for that date
            if (j.dates.length === 0 || j.dates[0].games === undefined) return [];

            /**
             * By default, API returns live games before completed ones. This can spoil outcomes.
             * Override this and explicitly sort by start time instead.
             */

            return j.dates[0].games.sort((a, b) => {
                if (a.gameDate > b.gameDate) return 1;
                if (a.gameDate < b.gameDate) return -1;
                return 0;
            });    
        })
        .then((x) => {
            // Only insert games if current date matches the date we got games for
            // Otherwise, we are still loading the desired games
            if (this.state.date !== dateString) return;
            this.setState({message: false, games: x});
        })
        .catch((e) => {
            console.error(e);
            this.setState({message: "Failed to download schedule for " + dateString + ".", games: []})
        });
    }

    render() {
        let contents;
        if (this.state.message) {
            contents = <p>{this.state.message}</p>;
        }
        else if (this.state.games.length === 0) {
            contents = <p>No games for {this.state.date}</p>;
        } else {
            let gamelist = this.state.games.map((item) => (
                <GameListItem
                    gameDate={item.gameDate}
                    gameLabel={item.seriesSummary?.gameLabel}
                    inactive={!(
                        ["3", "4", "5", "6", "7"].includes(item.status.statusCode)
                        // Bug in NHL API -- it is currently reporting "1" (scheduled) for games that have started
                        // Check that manually instead because it can't be trusted.
                        || (item.status.statusCode === "1" && new Date() > new Date(item.gameDate))
                        )}
                    home={item.teams.home.team.name}
                    away={item.teams.away.team.name}
                    key={item.gamePk}
                    gamePk={item.gamePk}
                    downloadGame={this.props.downloadGame}
                />
            ));
            contents = <ul className="game-list">{gamelist}</ul>;
        }
        return (
            <>
            <div className="game-list">
            <GameListDatePicker
                minDate={this.minDate}
                maxDate={this.maxDate}
                defaultDate={this.defaultDate}
                date={this.state.date}
                getGames={this.getGames}
                adjustDate={this.adjustDate} />
            <h2>Games for {this.state.date}</h2>
            {contents}
            </div>
            <RandomGame downloadGame={this.props.downloadGame} />
            </>
        );
    }
}

class GameListDatePicker extends React.Component {
    constructor(props) {
        super(props);
        this.handleChange = this.handleChange.bind(this);
        this.defaultDate = props.defaultDate;
    }

    handleChange(e) {
        this.props.getGames(e.target.value);
    }

    render() {
        return (
            <div className="game-list--date-picker">
            <div className="game-list--date-picker--buttons">
            {this.props.date > this.props.minDate && <button onClick={this.props.adjustDate.bind(this, 'down')}>Previous day</button>}
            <input aria-label="Select date" min={this.props.minDate} max={this.props.maxDate} id="date_picker" type="date" onChange={this.handleChange} value={this.props.date}></input>
            {this.props.date < this.props.maxDate && <button onClick={this.props.adjustDate.bind(this, 'up')}>Next day</button>}
            {this.props.date !== this.defaultDate && <button onClick={this.props.adjustDate.bind(this, this.defaultDate)}>Jump to Today</button>}
            </div>
            </div>
        )
    }
}


class GameListItem extends React.Component {
    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }

    handleClick() {
        if (this.props.inactive) return;

        if (window.gtag) {
            window.gtag("event", "gamePlay", {
                gamePk: this.props.gamePk
            });
        }

        this.props.downloadGame(this.props.gamePk);
    }

    formatLocaleTime() {
        /**
         * return: formatted local time (eg. 8:00 AM)
         */
        try {
            const ds = new Date(this.props.gameDate).toLocaleTimeString();
            const matches = ds.match(/^(\d+:\d+):\d+(\s?\w{2})$/);
            return matches[1] + matches[2];
        } catch(e) { // who knows, dates are voodoo
            console.warn(e);
            return this.props.gameDate;
        } 
    }

    render() {
        let cn = "game-list--item button-link";
        if (this.props.inactive) cn += ' inactive';
        return (
            <li>
                <button className={cn} onClick={this.handleClick}>
                <span className="game-list--date">{this.formatLocaleTime()}</span>
                <span className="game-list--label">{this.props.home} vs. {this.props.away} {this.props.gameLabel ? ' (' + this.props.gameLabel + ')' : ''}</span>
                </button>
            </li>
        )
    }
}

class RandomGame extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isLoading: false
        }
    }

    playRandomGame(historic=false) {
        // Download and play a random game.
        // historic: Whether to include historic games without shot/location

        if (window.gtag) {
            window.gtag("event", "randomGame", {
                historic: historic
            });
        }

        let years = Object.keys(yearGames);
        if (!historic) years = years.filter(x=>x>="2010");

        let randomYear = years[Math.floor(Math.random() * years.length)];

        // 80% chance of loading a regular season game
        if (Math.random() < .8) {
            let randomGame = Math.ceil(Math.random() * yearGames[randomYear]);
            const gamePk = randomYear.toString() + '02' + randomGame.toString().padStart(4, '0');
            this.props.downloadGame(gamePk);
        } else {
            // 20% chance of a playoff game
            // Since playoff game IDs are not predictable, we have to first
            // send a request to get all the playoff games for a given season
            this.setState({isLoading: true});
            let seasonName = randomYear + (Number(randomYear) + 1).toString();
            fetch("https://statsapi.web.nhl.com/api/v1/schedule?season="+seasonName+"&gameType=P")
            .then((r) => {return r.json()})
            .then((j) => {
                let games = [];
                j.dates.forEach((d) => {
                    games.push(...d.games)
                });
                const randomGame = games[Math.floor(Math.random() * games.length)];
                this.props.downloadGame(randomGame.gamePk)
            })
            .catch((e) => {
                console.warn(e);
            })
            .finally(()=>{this.setState({isLoading: false});})
        }
    }

    render() {
        return(
            <div className="random-game">
                <h3>Watch a random game?</h3>
                <p>You never know what you'll get!</p>
                {this.state.isLoading && <p>Now loading a random playoff game... (This may take a bit longer)</p>}
                {!this.state.isLoading && <ul className="game-list">
                <li><button className="button-link game-list--item" onClick={this.playRandomGame.bind(this, false)}>
                    <span className="game-list--date">2010 - p.</span>
                    <span className="game-list--label">Random game with detailed event data</span>
                </button></li>
                <li><button className="button-link game-list--item" onClick={this.playRandomGame.bind(this, true)}>
                    <span className="game-list--date">1917 - p.</span>
                    <span className="game-list--label">Random game from any time</span>
                </button></li>
                </ul>
                }
            </div>
        )
    }
}
export default GameList;
