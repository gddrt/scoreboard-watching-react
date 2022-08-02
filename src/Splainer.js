import React from 'react';
import { BsGithub, BsTwitter } from 'react-icons/bs';
import './Splainer.css';

function FAQ(props) {
    return (
        <>
        <h2>About</h2>
        <p>This application retrieves play-by-play data from the public NHL API for any game in league history, and replays the actual game data on a simulated scoreboard.</p>
        <h2>Information</h2>
        <p>The scoreboard displays the game clock, score, shots on goal and shot attempts. The recorded location of each event is displayed over a rink so you can follow where the action really happened.</p>
        <p>The game list displays games for the given date in Eastern Time, the game time is your local time. Viewable games are either in progress or complete.</p>
        <p>*Games prior to the 2010-11 season do not have location data or events other than goals and penalties.</p>
        <h2>Controls</h2>
        <p>You can adjust the playback speed (multiple of real time.) You can hold the fast forward button. You can click the progress bar to jump to any point in regulation time. Overtime is not displayed on the progress bar to prevent spoilers.</p>
        <p>By default, there is a slight pause in playback for all game stoppages. You can toggle pausing for trivial stoppages such as offsides and icing.</p>
        <h2>Sources, Etc.</h2>
        <p>All game data is from the <a target="_blank" rel="noreferrer" href="https://statsapi.web.nhl.com/api/v1/configurations">NHL Stats API</a>. Special thanks to:</p>
        <ul>
            <li>Drew Hynes for their <a target="_blank" rel="noreferrer" href="https://gitlab.com/dword4/nhlapi/-/blob/master/stats-api.md">documentation of the API.</a></li>
            <li><a href="https://www.hockey-reference.com/leagues/stats.html" target="_blank" rel="noreferrer">Hockey Reference</a> for listing the number of games per season, which made the random game function possible.</li>
        </ul>
        <p>This is a fan project, unaffiliated with the NHL. NHL is a registered trademark of the National Hockey League.</p>

        <nav className="social-links">
            <a target="_blank" rel="noreferrer" className="github" href="https://github.com/gddrt/scoreboard-watching-react"><BsGithub /><span>View project on Github</span></a>
            <a target="_blank" rel="noreferrer" className="twitter" href="https://twitter.com/gddrt_"><BsTwitter /><span>Follow me on Twitter</span></a>
        </nav>
        <button onClick={props.toggleInfo}>Got it, thanks!</button>
        </>
    )
}
class Splainer extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            showFAQ: false
        }
        this.toggleInfo = this.toggleInfo.bind(this);
    }

    toggleInfo() {
        this.setState({showFAQ: !this.state.showFAQ});
    }

    render() {
        const buttonText = this.state.showFAQ ? "Hide Info" : "What's all this?";
        return (
        <section className="explainer">
            <h1>Scoreboard Watching</h1>
            <p>The fun and spoiler-free way to catch up on NHL hockey games (or parts) you missed. Watch the action unfold play-by-play!</p>

            <button onClick={this.toggleInfo}>{buttonText}</button>
            {this.state.showFAQ && <FAQ toggleInfo={this.toggleInfo}/>}
        </section>
        );
    }
}

export default Splainer;