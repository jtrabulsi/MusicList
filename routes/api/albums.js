const Album = require('../../models/album.js');
const Artist = require('../../models/artist.js');
const appConfig = require('../../config.js');
const Discogs = require('disconnect').Client;
const express = require('express');
const mongoose = require('mongoose');
const User = require('../../models/user.js');

const router = express.Router();

// configure mongoose promises
mongoose.Promise = global.Promise;

// configure Discogs
const discogsClient = new Discogs('musiclist-msmedes', {
  consumerKey: appConfig.discogs.key,
  consumerSecret: appConfig.discogs.secret,
});
const discogsDB = discogsClient.database();

const saveAlbum = async (albumInfo) => {
  let errors = false;
  const albumQuery = await Album.findOne({ discogsId: albumInfo.id });
  if (!albumQuery) {
    const albumInfoModified = Object.assign({ discogsId: albumInfo.id }, albumInfo);
    const newAlbum = new Album(albumInfoModified);
    await newAlbum.save((error) => {
      if (error) { errors = true; }
    });
  }
  if (errors) {
    return false;
  }
  return true;
}

const saveArtists = async (artists) => {
  const formattedArtists = artists.map((artist) => {
    const newArtist = Object.assign({ discogsId: artist.id }, artist);
    return newArtist;
  });
  try {
    const result = await Artist.insertMany(
      formattedArtists,
      { ordered: false },
      (error) => {
        if (error && error.code !== 11000) {
          return false;
        }
        return true;
      },
    );
    return result;
  } catch (error) {
    if (error.code !== 11000) {
      return false;
    }
    return true;
  }
};

// POST to /add
router.post('/add', async (req, res) => {
  // Make sure a user's actually logged in
  if (!req.user) {
    return res.json({ error: 'User not logged in' });
  }

  // Wrap discogs API call in a promise so we can use async / await
  const discogsGetMaster = albumId => new Promise((resolve) => {
    discogsDB.getMaster(albumId, (err, data) => {
      resolve(data);
    });
  });

   // Get a single artist from Discogs
   const discogsGetArtist = artistId => new Promise((resolve) => {
    discogsDB.getArtist(artistId, (err, data) => {
      resolve(data);
    });
  });

  // Loop through artists and hit the Discogs API for each
  const getArtists = async (artists) => {
    const results = artists.map((artist) => {
      const artistInfo = discogsGetArtist(artist.id);
      return artistInfo;
    });
    return Promise.all(results);
  };

  const albumId = parseInt(req.body.id, 10);
  let result;

  try {
    // Get album info from discogs AI
    const albumInfo = await discogsGetMaster(albumId);

    // Save it to the MusicList DB if it's not already there
    const albumSaved = await saveAlbum(albumInfo);
    if (!albumSaved) { return JSON.stringify(new Error('There was a problem saving the album to the database.')); }

    // Go through the album's artists and get their full info from Discogs
    const artistsInfo = await getArtists(albumInfo.artists);

    // Save the artists to the MusicList DB if they're not already there
    const artistsSaved = await saveArtists(artistsInfo);
    if (!artistsSaved) { return JSON.stringify(new Error('There was a problem saving the artist to the database.')); }

    // Find the user we want to save to
    const query = User.findOne({ email: req.user.email });
    const foundUser = await query.exec();

    // Sanity Check! Is the album already added?
    const albumIndex = foundUser.albums.indexOf(albumInfo.id);
    if (albumIndex < 0) {
      foundUser.albums.push(albumInfo.id);
    }

    // Sanity Check 2! Is the artist already added?
    for (let i = 0; i < albumInfo.artists.length; i += 1) {
      const artistIndex = foundUser.artists.indexOf(albumInfo.artists[i].id);
      if (artistIndex < 0) {
        foundUser.artists.push(...albumInfo.artists.map(artist => artist.id));
      }
    }

    foundUser.save((error) => {
      if (error) {
        result = res.json({ error: 'Album could not be saved. Please try again.' });
      } else {
        result = res.json(foundUser);
      }
    });
  } catch (err) {
    result = res.json({ error: 'There was an error saving the album to the database. Please try again.' });
  }

  return result;

});

// POST to /search
router.post('/search', async (req, res) => {
  // Contact Discogs API
  await discogsDB.search(req.body, (err, data) => {
    if (err) {
      const error = new Error(err);
      return res.json(error);
    }
    return res.json(data);
  });
});

module.exports = router;