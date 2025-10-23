import { BrowserRouter, Routes, Route } from 'react-router-dom';

import Navbar from './components/layout/Navbar';
import Home from './pages/Home';
import Game from './pages/Game';
import Shop from './pages/Shop';
import ShopItem from './pages/ShopItem';
import Rules from './pages/Rules';

function App() {
  return (
    <>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/game' element={<Game />} />
          <Route path='/shop' element={<Shop />} />
          <Route path='/shop/:id' element={<ShopItem />} />
          <Route path='/rules' element={<Rules />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
