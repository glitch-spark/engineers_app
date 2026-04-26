import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import UserExtra from '@/models/UserExtra';

export async function PUT(request: NextRequest) {
  try {
    // Get the current session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Connect to database
    await dbConnect();

    // Get the request body
    const body = await request.json();
    const { username, email, image, birthday } = body;

    // Find the user
    const user = await UserExtra.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Validate required fields
    if (!username || !email) {
      return NextResponse.json({ error: 'Username and email are required' }, { status: 400 });
    }

    // Check if email is already taken by another user
    if (email !== session.user.email) {
      const existingUser = await UserExtra.findOne({ email: email.toLowerCase() });
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return NextResponse.json({ error: 'Email is already taken' }, { status: 400 });
      }
    }

    // Update user fields
    user.name = username.trim();
    user.email = email.toLowerCase().trim();
    user.image = image || '';
    
    if (birthday) {
      user.birthday = new Date(birthday);
    }

    // Save the user
    await user.save();

    return NextResponse.json({ 
      message: 'Profile updated successfully',
      user: {
        username: user.name,
        email: user.email,
        image: user.image,
        birthday: user.birthday
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get the current session
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Connect to database
    await dbConnect();

    // Find the user
    const user = await UserExtra.findOne({ email: session.user.email }).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Type assertion to handle the lean() return type
    const userData = user as any;

    // Return user data (excluding sensitive information)
    return NextResponse.json({
      user: {
        username: userData.name || '',
        email: userData.email || '',
        image: userData.image || '',
        birthday: userData.birthday || null
      }
    });

  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
