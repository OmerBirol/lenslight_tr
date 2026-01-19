import User from "../models/userModel.js";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import Photo from '../models/photoModel.js';
import { v2 as cloudinary } from 'cloudinary';
import fs from "fs";
const createUser = async (req, res) => {
  try {
    const user = await User.create(req.body);

    res.status(201).json({user: user._id});
    
  } catch (error) {
    console.log('ERROR',error)
    let errors2= {};

    if(error.code===11000){
      errors2.email = "The email is already registered"
    }

    if(error.name==="ValidationError"){
      Object.keys(error.errors).forEach((key)=>{
        errors2[key]=error.errors[key].message;
      });
    }

    


    res.status(400).json(errors2);
  }
};

const loginUser = async (req, res) => {
  try {
   const { username, password } = req.body;

    const user = await User.findOne({ username });

    let same = false;

    if (user) {
      same = await bcrypt.compare(password, user.password);
    } else {
      return res.status(401).json({
        succeded: false,
        error: 'There is no such user',
      });
    }
    if (same){

      const token = createToken(user._id)
      res.cookie("jwt",token,{
        httpOnly:true,
        maxAge:1000*60*60*24,
      });


     res.redirect('/users/dashboard');
      }
      else{
        res.status(401).json({
          succeded:false,
          error:"Password is not matched",
        });
      }
  } catch (error) {
    res.status(500).json({
      succeded: false,
      error: error.message,
    });
  }
};

const createToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: '1d',
  });
};

const getDashboardPage = async (req, res) => {
  const photos = await Photo.find({ user: res.locals.user._id });
  const user = await User.findById({ _id: res.locals.user._id }).populate([
    'followings',
    'followers',
  ]);
  res.render('dashboard', {
    link: 'dashboard',
    photos,
    user,
    currentUser: res.locals.user,
  });
};


const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({_id: {$ne: res.locals.user._id}});
    res.status(200).render("users",{
      users,
      link:"users",
    });

  } catch (error) {
    res.status(500).json({
      succeded: false,
      error: error.message,
    });
  }
};

const getAUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    const inFollowers = user.followers.some((follower) => {
      return follower.equals(res.locals.user._id);
    });

    const photos = await Photo.find({user: user._id})
    res.status(200).render("user",{
      user,
      link:"users",
      photos,
      inFollowers,
    });

  } catch (error) {
    res.status(500).json({
      succeded: false,
      error: error.message,
    });
  }
};


const follow = async (req, res) => {
  // res.locals.user._id
  try {
    let user = await User.findByIdAndUpdate(
      { _id: req.params.id },
      {
        $addToSet: { followers: res.locals.user._id },
      },
      { new: true }
    );

    user = await User.findByIdAndUpdate(
      { _id: res.locals.user._id },
      {
        $addToSet: { followings: req.params.id }
      },
      { new: true }
    );

    res.status(200).redirect(`/users/${req.params.id}`);
  } catch (error) {
    res.status(500).json({
      succeded: false,
      error,
    });
  }
};
const unfollow = async (req, res) => {
  // res.locals.user._id
  try {
    let user = await User.findByIdAndUpdate(
      { _id: req.params.id },
      {
        $pull: { followers: res.locals.user._id },
      },
      { new: true }
    );

    user = await User.findByIdAndUpdate(
      { _id: res.locals.user._id },
      {
        $pull: { followings: req.params.id },
      },
      { new: true }
    );

    res.status(200).redirect(`/users/${req.params.id}`);
  } catch (error) {
    res.status(500).json({
      succeded: false,
      error,
    });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    // 1) Dosya var mı?
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({ message: "Avatar dosyasi yok" });
    }

    const user = await User.findById(res.locals.user._id);

    // 2) Eski avatar varsa Cloudinary’den sil
    if (user.avatar_id) {
      await cloudinary.uploader.destroy(user.avatar_id);
    }

    // 3) Cloudinary upload
    const result = await cloudinary.uploader.upload(
      req.files.avatar.tempFilePath,
      {
        use_filename: true,
        folder: "avatars", // ayrı klasör iyi olur
      }
    );

    // 4) DB’ye kaydet
    user.avatar = result.secure_url;   // ✅ BURASI
    user.avatar_id = result.public_id;
    await user.save();

    // 5) temp dosyayı sil
    fs.unlinkSync(req.files.avatar.tempFilePath);

    return res.status(200).redirect("/users/dashboard"); // istersen json da dönebilirsin
  } catch (error) {
    return res.status(500).json({
      succeded: false,
      error: error.message,
    });
  }
};
const updateBio = async (req, res) => {
  try {
    const user = await User.findById(res.locals.user._id);
    user.bio = req.body.bio;
    await user.save();

    res.redirect("/users/dashboard");
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


export{createUser,loginUser,getDashboardPage,getAllUsers,getAUser,follow,unfollow,uploadAvatar,updateBio};