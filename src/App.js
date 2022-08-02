import React from 'react';

import GamePlayer from './GamePlayer'
import Splainer from './Splainer'

class App extends React.Component {

    render() {
        return (
            <>
                <Splainer />
                <GamePlayer />
            </>
        )
    }
}

export default App;