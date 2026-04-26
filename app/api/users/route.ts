import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { dbConnect } from '@/lib/db';
import UserExtra from '@/models/UserExtra';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();
    
    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Build query
    const query: any = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (role) {
      query.role = role;
    }
    
    if (status) {
      // For now, all users are considered active
      // You can extend this based on your business logic
      if (status === 'inactive') {
        query.$or = [
          { deletedAt: { $exists: true } },
          { isActive: false }
        ];
      }
    }
    
    // Calculate pagination
    const skip = (page - 1) * limit;
    
    // Get total count
    const total = await UserExtra.countDocuments(query);
    
    // Get users with pagination
    const users = await UserExtra.find(query)
      .select('-hashedPassword') // Don't return password
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
    
    const totalPages = Math.ceil(total / limit);
    
    return NextResponse.json({
      users,
      pagination: {
        total,
        page,
        limit,
        totalPages
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || (session.user as any).role !== 'admin') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  try {
    await dbConnect();
    const body = await req.json();
    
    // Validate required fields
    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Email and name are required' }, { status: 400 });
    }
    
    // Check if user already exists
    const existingUser = await UserExtra.findOne({ email: body.email });
    if (existingUser) {
      return NextResponse.json({ error: 'User with this email already exists' }, { status: 409 });
    }
    
    // Create new user
    const userData = {
      name: body.name,
      email: body.email,
      role: body.role || 'staff',
      phone: body.phone || '',
      birthday: body.birthday ? new Date(body.birthday) : undefined,
      // Note: hashedPassword would be set during user registration
      // For now, we'll create a placeholder
      hashedPassword: 'placeholder'
    };
    
    const newUser = await UserExtra.create(userData);
    
    // Return user without password
    const { hashedPassword, ...userResponse } = newUser.toObject();
    
    return NextResponse.json(userResponse, { status: 201 });
  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}
