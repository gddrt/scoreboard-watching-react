import React from 'react';
import { BsFillPlayFill, BsPauseFill } from 'react-icons/bs';
import { AiOutlinePlus, AiOutlineMinus } from 'react-icons/ai';
import { HiFastForward } from 'react-icons/hi';

import './Controls.css';

class SpeedControl extends React.Component {
    handleClick(dir) {
        this.props.adjustSpeed(dir);
    }

    displaySpeed() {
        return Math.floor(1000 / this.props.playbackSpeed).toString() + 'x';
    }

    render() {
        return (
        <div className="speed-controls">
            <button className="icon-button" aria-label="Decrease playback speed" type="button" onClick={this.handleClick.bind(this, 'down')}><AiOutlineMinus /></button>
            <span className="speed-label">{this.displaySpeed()}</span>
            <button className="icon-button" aria-label="Increase playback speed" type="button" onClick={this.handleClick.bind(this, 'up')}><AiOutlinePlus /></button>
        </div>
        )
    }
}

class PlayControl extends React.Component {
    handleClick() {
        this.props.isPlaying ? this.props.pause() : this.props.play();
    }

    getClickLabel() {
        return this.props.isPlaying ? 'Pause' : 'Play';
    }

    getClickIcon() {
        return this.props.isPlaying ? <BsPauseFill /> : <BsFillPlayFill />;
    }

    handleFF(on) {
        if (!this.props.isPlaying) return;

        // Set ff value
        console.log('Setting fastforward', on);
        this.props.fastForward(on);
    }

    render() {
        const ffClass = this.props.isPlaying ? 'icon-button' : 'icon-button disabled';
        return (
            <>
            <button
                type="button"
                className="icon-button"
                aria-label={this.getClickLabel()}
                onClick={this.handleClick.bind(this)}
            >{this.getClickIcon()}</button>
            <button
                type="icon-button"
                className={ffClass}
                aria-label="Fast forward"
                onTouchStart={this.handleFF.bind(this, true)}
                onMouseDown={this.handleFF.bind(this, true)}
                onTouchCancel={this.handleFF.bind(this, false)}
                onTouchEnd={this.handleFF.bind(this, false)}
                onMouseUp={this.handleFF.bind(this, false)}
                onMouseLeave={this.handleFF.bind(this, false)}
            ><HiFastForward /></button>
            </>
        )
    }
}

class ProgressBar extends React.Component {
    handleChange(e) {
        this.props.setProgress(e.target.value);
    }
    render() {
        return (
            <div className="playback-meter">
                <input type="range"
                    list="tickmarks"
                    className="time-slider"
                    min="0"
                    max="3600"
                    value={this.props.timeElapsed}
                    onChange={this.handleChange.bind(this)}
                />
                <datalist id="tickmarks">
                    <option value="0" label="1st"></option>
                    <option value="1200" label="2nd"></option>
                    <option value="2400" label="3rd"></option>
                    <option value="3600" label="E.R"></option>
                </datalist>
            </div>
        )
    }
}

class StoppageSetting extends React.Component {
    handleChange(e) {
        this.props.setStoppageSetting(!e.target.checked);
    }

    render() {
        return (
            <>
                <input id="pause_on_stoppage" type="checkbox" checked={this.props.pauseOnAllStoppages} onChange={this.handleChange.bind(this)}></input>
                <label htmlFor="pause_on_stoppage">Pause on all stoppages</label>
            </>
        )
    }
}
class Controls extends React.Component {
    render() {
        return (
            <>
            <div className="control-buttons">
            <SpeedControl playbackSpeed={this.props.playbackSpeed} adjustSpeed={this.props.adjustSpeed}/>
            <PlayControl
                pause={this.props.pause}
                play={this.props.play}
                fastForward={this.props.fastForward}
                isPlaying={this.props.isPlaying} />
            </div>
            <ProgressBar
                timeElapsed={this.props.timeElapsed}
                setProgress={this.props.setProgress}
            />
            <StoppageSetting
                setStoppageSetting={this.props.setStoppageSetting}
                pauseOnAllStoppages={this.props.pauseOnAllStoppages}
            />
            </>
        )
    }
}

export default Controls;