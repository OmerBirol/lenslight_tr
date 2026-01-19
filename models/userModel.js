import mongoose from "mongoose";
import bcrypt from "bcrypt";
import validator from "validator";


const { Schema } = mongoose;
const userSchema = new Schema({

    username: {
        type: String,
        required: [true,"Username area is required"],
        lowercase:true,
        validate:[validator.isAlphanumeric,"Only alphanumeric character"],
    },
    email: {
        type: String,
        required: [true,"Email area is required"],
        unique: true,
        validate:[validator.isEmail,"Valid email is required"]
    },
    password: {
        
        type: String,
        required: [true,"Password area is required"],
        minlength: [4, "At least 4 characters"],

    },
    followers: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
          default: [],
        },
      ],
      followings: [
        {
          type: Schema.Types.ObjectId,
          ref: 'User',
          default: [],
        },
      ],
      avatar: {
        type: String, // Cloudinary URL
        default: "",
      },
      avatar_id: {
        type: String, // Cloudinary public_id (silmek için)
        default: "",
      },
      bio: {
        type: String,
        default: "",
        maxlength: 500,
      }
    

    },
{
    timestamps:true,
}

);
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 10);
  next();
  
});



const User = mongoose.model("User", userSchema);
export default User;
