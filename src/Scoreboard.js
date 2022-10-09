import './Scoreboard.css';
import React from 'react';

class Scoreboard extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            copyCooldown: false
        }
    }

    getGameTitle() {
        return this.props.game.teams.home.locationName + ' ' + this.props.game.teams.home.teamName + ' vs. ' + this.props.game.teams.away.locationName + ' ' + this.props.game.teams.away.teamName;
    }
    getDisplayTime() {
        // Get the value to be displayed on the game clock for this event
        // Either take the explicit value from the NHL API, or compute it
        // if it wasn't provided

        let periodName;
        switch(this.props.period) {
            case 1:
                periodName = "1st";
                break;
            case 2:
                periodName = "2nd";
                break;
            case 3:
                periodName = "3rd";
                break;
            case 4:
                periodName = "OT";
                break;
            case 5:
                // Period 5 and not playoffs means shootout
                // Shootouts don't have time
                if (!this.props.game.isPlayoffs) return "0:00 SO";
                else periodName = "2OT";
                break;
            default:
                periodName = (this.props.period - 3).toString() + "OT";
                break;
        }

        // Each period is 20 minutes, usually.
        // Regular season overtime is only 5 minutes, and there's only one.
        let periodTime = 20 * this.props.period;
        if (!this.props.game.isPlayoffs)
            periodTime = Math.min(
                periodTime,
                60 + this.props.game.overtimeLength
            );

        // Create time string from parts
        let mins = periodTime - Math.ceil(this.props.timeElapsed / 60);
        let secs = (59 - this.props.timeElapsed % 60 + 1) % 60;
        return mins.toString() + ':' + secs.toString().padStart(2, '0') + ' ' + periodName;
    }

    copyLink() {
        const newUrl = new URL(window.location.href);
        newUrl.search = '?game=' + this.props.game?.gamePk?.toString();
        window.navigator.clipboard.writeText(newUrl.toString());
        this.setState({
            copyCooldown: true
        });
        window.setTimeout(() => {this.setState({copyCooldown: false})}, 3000);
    }

    render() {
        if (this.props.gameLoadingState === 0) return null;

        // TODO display some error data
        if (this.props.gameLoadingState === 1) return (
            <p className="player-status">Error. You can try to load another game.</p>
        );

        if (this.props.gameLoadingState === 2) return (
            <p className="player-status">Downloading game...</p>
        );

        if (this.props.gameLoadingState === 3) return (
            <p className="player-status">Initializing game data...</p>
        );

        let cn = "scoreboard";
        if (!this.props.game.hasPeriodEvents) cn += " no-detail";
        return (
        <div className={cn}>
            <div className="game-meta">
                <h3 className="game-title">{this.getGameTitle()}</h3>
                {this.props.game.isPlayoffs && <p className="game-detail">{this.props.game.playoffDescription}</p>}
                <p className="game-detail">{this.props.game.gameDetail}</p>
                {this.props.game && <button className="copy-button button-link" onClick={this.copyLink.bind(this)}>{this.state.copyCooldown ? 'Link copied' : 'Copy link to this game'}</button> }
            </div>
            <div className="game-clock-container">
            <div className="game-clock">{this.getDisplayTime()}</div>
            {this.props.penaltyInfo &&
                <div className="penalty-clock" data-team={this.props.penaltyInfo.triCode.toLowerCase()}>
                    <span className="penalty-clock-team">{this.props.penaltyInfo.triCode}</span>
                    <span className="penalty-clock-status">{this.props.penaltyInfo.type}</span>
                    <span className="penalty-clock-time">{this.props.penaltyInfo.clock}</span>
                </div>
            }
            </div>
            <div className="game-state">
            <Team
                team={this.props.game.teams.away}
                designation='away'
                score={this.props.score.away}
                eventLabel={this.props.eventLabel === 'GOAL_AWAY' ? 'GOAL' : ''}
            />
            <Team
                team={this.props.game.teams.home}
                designation='home'
                score={this.props.score.home}
                eventLabel={this.props.eventLabel === 'GOAL_HOME' ? 'GOAL' : ''}
            />
            <Rink
                season={this.props.game.season}
                eventLabel={this.props.eventLabel}
                period={this.props.period}
                coordinates={this.props.coordinates}
                homeTeam={this.props.game.teams.home}
                awayTeam={this.props.game.teams.away}
                isMirrored={this.props.game.mirrorCoordinates}
                specialAnim={this.props.specialAnim}
            />
            <p className="event-description">{this.props.description}</p>
            </div>
        </div>
        )
    }
}

class Team extends React.Component {
    constructor(props) {
        super(props);
        this.className = [
            'team',
            props.team.triCode.toLowerCase(),
            props.designation
        ].join(' ')
    }

    renderShootout() {
        const className = this.className + ' shootout';
        let shootoutScore = ['-', '-', '-'];
        let latestShots = this.props.score.shootoutState;
        if (latestShots.length > 3) {
            let startIndex = Math.max(3, latestShots.length - 3);
            latestShots = latestShots.slice(
                startIndex,
                startIndex + 3
            );
        }
        for(let i=0; i<latestShots.length; i++) {
            shootoutScore[i] = latestShots[i];
        }

        let i = 0;
        const shootoutTiles = shootoutScore.map((x)=>{
            i++;
            let cn = 'shootout-result shootout-result-' + x;
            return (<div className={cn} key={i}>{x}</div>)
        })
        return (
            <div className={className} data-team={this.props.team.triCode.toLowerCase()}>
                <div aria-label={this.props.team.locationName + ' ' + this.props.team.teamName} className="team-name">
                    <p className="city">{this.props.team.locationName}</p>
                    <p className="name">{this.props.team.teamName}</p>
                    {this.props.eventLabel === 'GOAL' && <GoalAnimation />}
                </div>
                <div className="shootout-score">
                    {shootoutTiles}
                </div>
            </div>
        );
    }

    renderGame() {
        const scoreDisplayMode = this.props.score.goals >= 10 ? 'compact' : 'normal';
        const klass = [scoreDisplayMode, 'score'].join(' ');
        return (
            <div className={this.className} data-team={this.props.team.triCode.toLowerCase()}>
                <div aria-label={this.props.team.locationName + ' ' + this.props.team.teamName} className="team-name">
                    <p className="city">{this.props.team.locationName}</p>
                    <p className="name">{this.props.team.teamName}</p>
                    {this.props.eventLabel === 'GOAL' && <GoalAnimation />}
                </div>
                <div className={klass}>{this.props.score.goals}</div>
                <div className="shots">
                    <span aria-label={this.props.score.shots.toString() + ' shots on goal'} className="ongoal">{this.props.score.shots}</span>
                    <span aria-label={this.props.score.shotAttempts.toString() + ' shot attempts'} className="attempts">{this.props.score.shotAttempts}</span>
                </div>
            </div>
        );
    }
    render() {
        if (this.props.score.shootoutState !== undefined) return this.renderShootout();
        else return this.renderGame();
    }
}

function GoalAnimation() {
    return (
        <div className="goal-anim"><span>GOAL!</span></div>
    )
}

class Rink extends React.Component {
    render() {
        // Determine which rink graphic to use. Will add more some day!
        const season = this.props.season >= "2005" ? "2005" : "1998";
        return(
            <div className="rink-container" data-period={this.props.period % 2 === 0 ? 'even' : 'odd'}>
                <TeamLabel designation="home" team={this.props.homeTeam} />
                <GoalLights designation="home" animation={this.props.eventLabel} />
                <div className={"rink season-" + season}>
                    {this.props.specialAnim?.startsWith('HAT_TRICK') && <Hats isHome={this.props.specialAnim === 'HAT_TRICK_HOME'} />}
                    {this.props.specialAnim?.startsWith('PING') && <Ping period={this.props.period} isHome={this.props.specialAnim === 'PING_HOME'} />}
                    <Puck coordinates={this.props.coordinates} isMirrored={this.props.isMirrored} />
                </div>
                <GoalLights designation="away" animation={this.props.eventLabel} />
                <TeamLabel designation="away" team={this.props.awayTeam} />
            </div>
        )
    }
}

function TeamLabel(props) {
    const cn = "team-label " + props.designation;
    return (
        <span className={cn}>{props.team.triCode}</span>
    )
}

function GoalLights(props) {
    const cn = "goal-lights-container " + props.designation;
    return (
        <div className={cn} data-animation={props.animation}>
            <div className="goal-light light-goal"></div>
            <div className="goal-light light-time"></div>
            <div className="goal-light light-goal"></div>
        </div>
    )
}

function Puck(props) {
    const fixed = {
        x: props.isMirrored ? props.coordinates.x * -1 : props.coordinates.x,
        y: props.isMirrored ? props.coordinates.y : props.coordinates.y * -1
    }
    const style = {
        'top': (fixed.y + 42.5).toString() + 'px',
        'left': (fixed.x + 100).toString() + 'px'
    }
    return <div className="puck" style={style}></div>;
}

function Hats(props) {
    const hatCount = props.isHome ? 28 : 3;
    var hats = [];
    for (let i=0; i<hatCount; i++) {
        hats.push(<Hat key={i}/>)
    }
    return hats;
}

class Hat extends React.Component {
    constructor(props) {
        super(props);
        let isHoriz = Math.random() > .5;
        let start;
        if (isHoriz) {
            start = {
                x: Math.random() * 230 - 15,
                y: Math.random() > .5 ? -15 : 100
            }
        } else {
            start = {
                x: Math.random() > .5 ? -15 : 215,
                y: Math.random() * 115 - 15
            }
        }
        start.rotation = Math.floor(Math.random() * 360);
        this.state = start;
    }
    // This is very dumb
    componentDidMount() {
        let end = {
            x: (this.state.x - 100) * (.2 + Math.random() * .6) + 100,
            y: (this.state.y - 47) * (.2 + Math.random() * .4) + 47,
            rotation: this.state.rotation + 720 + Math.random() * 720
        }
        const tossTime = Math.random() * 450 + 50;
        window.setTimeout(_=>this.setState(end), tossTime);
    }

    render() {
        const style = {
            'top': this.state.y.toString() + 'px',
            'left': this.state.x.toString() + 'px',
            'transform': 'rotate(' + this.state.rotation.toString() + 'deg)'
        }
        return <div className="hat" style={style}></div>;
    }
}

class Ping extends React.Component {
    constructor(props) {
        super(props);
        this.ref = React.createRef();
    }

    componentDidMount() {
        // This is pretty hacky. There's a proper way to do it, but I'm in too deep.
        // When this mounts, spawn a new object outside the react ecosystem.
        const realPing = document.createElement('span');
        const isLeft = ((this.props.period + (this.props.isHome ? 0 : 1)) % 2 ) === 1;
        let horiz = isLeft ? "left" : "right";
        realPing.className = 'ping';
        realPing.innerText = 'Ping!';
        realPing.style = "top: 40px; " + horiz + ": 12px; transition: top 1s";
        this.ref.current.insertAdjacentElement('afterend', realPing);
        window.setTimeout(()=>{realPing.style.setProperty('top', '20px')}, 25);
        window.setTimeout(()=>{realPing.remove()}, 1000);
    }

    render() {
        return <span style={{position:"absolute", opacity:"0"}} ref={this.ref} />;
    }
}
export default Scoreboard;
