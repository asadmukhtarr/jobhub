const express = require('express');
const app = express();
const mongoose = require('mongoose');
const session = require('express-session');
const authMiddleware = require('./middleware/auth'); // Import the middleware

// ========== STEP 1: Session middleware FIRST ==========
app.use(session({
    secret: '03264300993',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ========== STEP 2: Custom middleware that uses session ==========
// ========== STEP 2: Custom middleware that uses session ==========
app.use((req, res, next) => {
    // Check if session exists before accessing properties
    if (req.session) {
        res.locals.user = req.session;
        res.locals.isLoggedIn = req.session.isLoggedIn || false;

        // Make messages available to all views
        res.locals.success = req.session.successMessage || null;
        res.locals.error = req.session.errorMessage || null;
        res.locals.warning = req.session.warningMessage || null;

        // Clear messages after they've been read (for views)
        // We'll clear them in the routes after rendering
    } else {
        res.locals.user = null;
        res.locals.isLoggedIn = false;
        res.locals.success = null;
        res.locals.error = null;
        res.locals.warning = null;
    }
    next();
});

// ========== STEP 3: Body parsers ==========
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ========== STEP 4: View engine ==========
app.set('view engine', 'ejs');

// ========== Database connection ==========
const connectDB = async () => {
    try {
        const mongoURI = 'mongodb://localhost:27017/jobhub';
        await mongoose.connect(mongoURI);
        console.log('✅ MongoDB connected successfully!');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};
connectDB();

// ========== Routes ==========
// Home Route - Fetch jobs from database
app.get('/', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        // Fetch featured jobs (active jobs with limit of 6)
        const featuredJobs = await collection.find({
            status: 'active'
        })
            .sort({ createdAt: -1 })
            .limit(6)
            .toArray();

        // Get total job count for statistics
        const totalJobs = await collection.countDocuments({ status: 'active' });

        // Get unique companies count
        const companies = await collection.distinct('company');
        const totalCompanies = companies.length;

        res.render('index', {
            currentPage: 'home',
            jobs: featuredJobs,
            totalJobs: totalJobs,
            totalCompanies: totalCompanies,
            totalCandidates: 10000, // You can fetch from users collection if needed
            satisfactionRate: 95
        });

    } catch (error) {
        console.error('❌ Error fetching jobs for homepage:', error);
        res.render('index', {
            currentPage: 'home',
            jobs: [],
            totalJobs: 0,
            totalCompanies: 0,
            totalCandidates: 0,
            satisfactionRate: 0
        });
    }
});

app.get('/about', (req, res) => {
    res.render('about', { currentPage: 'about' });
});

app.get('/contact', (req, res) => {
    res.render('contact', { currentPage: 'contact' });
});

// Jobs Route - Fetch all jobs from database
app.get('/jobs', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        // Fetch all jobs that are active
        const jobs = await collection.find({
            status: 'active'
        }).sort({ createdAt: -1 }).toArray(); // Sort by newest first

        console.log(`✅ Found ${jobs.length} active jobs`);

        // Get total count for display
        const totalJobs = jobs.length;

        res.render('jobs', {
            currentPage: 'jobs',
            jobs: jobs,
            totalJobs: totalJobs,
            error: null
        });

    } catch (error) {
        console.error('❌ Error fetching jobs:', error);
        res.render('jobs', {
            currentPage: 'jobs',
            jobs: [],
            totalJobs: 0,
            error: 'Could not load jobs. Please try again later.'
        });
    }
});
// View Job - Client Side (Public)
// View Job - Client Side (Public)
app.get('/job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;

        const db = mongoose.connection.db;
        const jobCollection = db.collection('job');
        const applicationsCollection = db.collection('applications');

        // Handle ObjectId
        let id = jobId;
        if (typeof jobId === 'string' && jobId.length === 24) {
            const { ObjectId } = require('mongodb');
            id = new ObjectId(jobId);
        }

        // Find the job
        const job = await jobCollection.findOne({
            _id: id,
            status: 'active' // Only show active jobs to public
        });

        // Check if job exists
        if (!job) {
            return res.render('job-not-found', {
                title: 'Job Not Found',
                currentPage: 'jobs'
            });
        }

        // Check if user is logged in and has already applied
        let hasApplied = false;
        let applicationStatus = null;

        if (req.session && req.session.isLoggedIn && req.session.userId) {
            const userId = req.session.userId.toString();
            const application = await applicationsCollection.findOne({
                jobId: jobId,
                userId: userId
            });

            if (application) {
                hasApplied = true;
                applicationStatus = application.status;
                console.log(`✅ User has already applied for this job. Status: ${applicationStatus}`);
            }
        }

        // Increment views
        await jobCollection.updateOne(
            { _id: id },
            { $inc: { views: 1 } }
        );

        // Get similar jobs (same category or skills)
        const similarJobs = await jobCollection.find({
            _id: { $ne: id },
            status: 'active',
            $or: [
                { type: job.type },
                { skills: { $in: job.skills || [] } }
            ]
        })
            .limit(4)
            .sort({ createdAt: -1 })
            .toArray();

        res.render('job-detail', {
            currentPage: 'jobs',
            title: job.title + ' - JobHub',
            job: job,
            similarJobs: similarJobs,
            user: req.session?.user || null,
            isLoggedIn: req.session?.isLoggedIn || false,
            hasApplied: hasApplied,
            applicationStatus: applicationStatus
        });

    } catch (error) {
        console.error('❌ Error viewing job:', error);
        res.render('job-not-found', {
            title: 'Job Not Found',
            currentPage: 'jobs',
            error: 'Could not load job details. Please try again.'
        });
    }
});
// Create New Job Route
app.get('/creat-new-job', authMiddleware.isAuthenticated, (req, res) => {
    res.render('afterlogin/layouts/dashboard', {
        body: 'cnj',
        title: 'Post New Job',
        activePage: 'create-job',
        userName: req.session?.user?.name || req.session.userName || 'John Doe',
        userEmail: req.session?.user?.email || req.session.userEmail || 'john@example.com',
        userRole: req.session.userRole || 'employer', // ✅ ADD THIS - FIXES THE ERROR
        totalJobs: 0,
        activeJobs: 0,
        totalViews: 0,
        totalApplications: 0,
        pendingApplications: 0,
        shortlistedCount: 0,
        myApplicationsCount: 0,
        savedJobsCount: 0,
        currentPage: 'Create New Job',
        job: null,
        errors: null,
        error: null
    });
});
// Save Job Route
app.post('/save/job', async (req, res) => {
    try {
        // 1. Extract form data
        const {
            user_id,
            title,
            type,
            location,
            salary,
            skills,
            description,
            requirements,
            vacancies,
            experience,
            status,
            views
        } = req.body;

        // 2. Validation
        const errors = [];

        if (!title || title.trim().length < 3) {
            errors.push('Job title is required and must be at least 3 characters');
        }

        if (!type) {
            errors.push('Please select a job type');
        }

        if (!location || location.trim().length < 2) {
            errors.push('Location is required');
        }

        if (!skills || skills.trim().length < 2) {
            errors.push('Please enter at least one skill');
        }

        if (!description || description.trim().length < 20) {
            errors.push('Job description must be at least 20 characters');
        }

        if (!requirements || requirements.trim().length < 10) {
            errors.push('Job requirements must be at least 10 characters');
        }

        if (!vacancies || parseInt(vacancies) < 1) {
            errors.push('Number of vacancies must be at least 1');
        }

        if (!experience) {
            errors.push('Please select required experience level');
        }

        // 3. If validation fails, return to form with errors
        if (errors.length > 0) {
            const user = req.session?.user || {
                userId: user_id || 1,
                name: 'John Doe',
                email: 'john@example.com'
            };

            return res.render('afterlogin/layouts/dashboard', {
                body: 'cnj',
                title: 'Post New Job',
                activePage: 'create-job',
                userName: user.name,
                userEmail: user.email,
                user: user,
                totalJobs: 12,
                activeJobs: 8,
                totalViews: 1234,
                currentPage: 'Create New Job',
                job: req.body,  // Return submitted data
                errors: errors  // Show validation errors
            });
        }

        // 4. Process skills (convert comma-separated string to array)
        const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);

        // 5. Process requirements (split by new lines)
        const requirementsArray = requirements.split('\n').filter(r => r.trim());

        // 6. Prepare job data for database
        const jobData = {
            user_id: user_id,
            title: title.trim(),
            type: type,
            location: location.trim(),
            salary: salary ? salary.trim() : 'Negotiable',
            skills: skillsArray,
            description: description.trim(),
            requirements: requirementsArray,
            vacancies: parseInt(vacancies),
            experience: experience,
            status: status || 'active',
            views: parseInt(views) || 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: status === 'active' ? true : false
        };

        // 7. Console the job object for debugging
        console.log('📝 Job Data to Save:', JSON.stringify(jobData, null, 2));

        // 8. Save to database
        const db = mongoose.connection.db;
        const collection = db.collection('job');
        const result = await collection.insertOne(jobData);

        console.log('✅ Job inserted successfully with ID:', result.insertedId);

        // 9. Set success flash message (if using flash)
        req.session.success = 'Job posted successfully!';

        // 10. Redirect to dashboard with success parameter
        res.redirect('/dashboard?success=Job posted successfully!');

    } catch (error) {
        console.error('❌ Error saving job:', error);

        // Handle duplicate key errors or other database errors
        if (error.code === 11000) {
            // Duplicate key error
            req.session.error = 'A job with this title already exists. Please use a different title.';
        } else {
            req.session.error = 'An error occurred while saving the job. Please try again.';
        }

        // Get user data for the form
        const user = req.session?.user || {
            userId: req.body.user_id || 1,
            name: 'John Doe',
            email: 'john@example.com'
        };

        // Return to form with error
        return res.render('afterlogin/layouts/dashboard', {
            body: 'cnj',
            title: 'Post New Job',
            activePage: 'create-job',
            userName: user.name,
            userEmail: user.email,
            user: user,
            totalJobs: 12,
            activeJobs: 8,
            totalViews: 1234,
            currentPage: 'Create New Job',
            job: req.body,  // Return submitted data
            errors: ['An error occurred while saving the job. Please try again.']
        });
    }
});
app.get('/apply', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        const jobId = req.query.jobId || req.query.job; // Support both param names
        console.log('🔍 Job ID from query:', jobId);

        let job = null;
        let error = null;
        let success = null;

        // Get messages from session
        if (req.session.errorMessage) {
            error = req.session.errorMessage;
            delete req.session.errorMessage;
        }
        if (req.session.successMessage) {
            success = req.session.successMessage;
            delete req.session.successMessage;
        }

        // If jobId is provided, fetch job details
        if (jobId) {
            try {
                const db = mongoose.connection.db;
                const collection = db.collection('job');
                const { ObjectId } = require('mongodb');

                // Validate if it's a valid ObjectId
                if (!ObjectId.isValid(jobId)) {
                    console.log('❌ Invalid ObjectId format:', jobId);
                    req.session.errorMessage = 'Invalid job ID';
                    return res.redirect('/jobs');
                }

                const id = new ObjectId(jobId);
                job = await collection.findOne({
                    _id: id,
                    status: 'active'
                });

                if (!job) {
                    console.log('❌ Job not found with ID:', jobId);
                    req.session.errorMessage = 'Job not found or no longer available';
                    return res.redirect('/jobs');
                }

                console.log('✅ Job found:', job.title);

            } catch (error) {
                console.error('❌ Error fetching job:', error);
                req.session.errorMessage = 'Could not load job details';
                return res.redirect('/jobs');
            }
        }

        // Get form data from session (for validation errors)
        const formData = req.session.formData || {};
        const validationErrors = req.session.validationErrors || [];

        // Clear session data after retrieving
        delete req.session.formData;
        delete req.session.validationErrors;

        res.render('apply', {
            currentPage: 'apply',
            user: req.session,
            job: job,
            formData: formData,
            errors: validationErrors,
            error: error,
            success: success,
            isLoggedIn: req.session.isLoggedIn || false
        });

    } catch (error) {
        console.error('❌ Error loading apply page:', error);
        req.session.errorMessage = 'Could not load application form';
        res.redirect('/jobs');
    }
});
// apply job backend functionlity ...
// ========== APPLY FOR JOB - POST ROUTE ==========
app.post('/apply/job', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        console.log('📝 Job application received');

        // 1. Extract form data
        const {
            fullname,
            email,
            phone,
            location,
            education,
            experience,
            skills,
            coverLetter,
            workAuth,
            notificationConsent,
            jobId,
            jobTitle,
            companyName
        } = req.body;

        console.log('📋 Form data:', { jobId, jobTitle, fullname, email });

        // 2. Get user ID from session
        const userId = req.session.userId;
        const userName = req.session.userName || fullname;

        // 3. Validation
        const errors = [];

        if (!fullname || fullname.trim().length < 2) {
            errors.push('Full name is required and must be at least 2 characters');
        }

        if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            errors.push('Valid email address is required');
        }

        if (!phone || phone.replace(/\D/g, '').length < 10) {
            errors.push('Valid phone number is required (minimum 10 digits)');
        }

        if (!education || education === '') {
            errors.push('Please select your education level');
        }

        if (!experience || experience === '') {
            errors.push('Please select your experience level');
        }

        if (!skills || skills.trim().length < 2) {
            errors.push('Please enter your skills');
        }

        if (!coverLetter || coverLetter.trim().length < 20) {
            errors.push('Cover letter must be at least 20 characters');
        }

        if (!workAuth || workAuth !== 'on') {
            errors.push('You must confirm your work authorization');
        }

        // 4. If there are validation errors, store in session and redirect
        if (errors.length > 0) {
            console.log('❌ Validation errors:', errors);

            // Store form data and errors in session
            req.session.formData = req.body;
            req.session.validationErrors = errors;

            // Redirect back to the apply form with jobId
            const redirectUrl = jobId ? `/apply?jobId=${jobId}` : '/apply';
            return res.redirect(redirectUrl);
        }

        // 5. Check if user already applied for this job
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');

        if (jobId && jobId !== 'N/A' && jobId !== '') {
            const existingApplication = await applicationsCollection.findOne({
                jobId: jobId,
                userId: userId.toString()
            });

            if (existingApplication) {
                req.session.warningMessage = 'You have already applied for this position';
                return res.redirect(`/job/${jobId}`);
            }
        }

        // 6. Process skills
        const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);

        // 7. Prepare application data
        const applicationData = {
            jobId: jobId || 'N/A',
            jobTitle: jobTitle || 'Unknown Position',
            companyName: companyName || 'Unknown Company',
            userId: userId.toString(),
            userEmail: req.session.userEmail || email,
            userName: req.session.userName || fullname,
            fullName: fullname.trim(),
            email: email.trim().toLowerCase(),
            phone: phone.trim(),
            location: location ? location.trim() : '',
            education: education,
            experience: experience,
            skills: skillsArray,
            coverLetter: coverLetter.trim(),
            workAuth: workAuth === 'on',
            notificationConsent: notificationConsent === 'on',
            status: 'pending',
            appliedAt: new Date(),
            updatedAt: new Date(),
            isActive: true,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent'] || ''
        };

        console.log('📝 Application Data:', JSON.stringify(applicationData, null, 2));

        // 8. Save to database
        const result = await applicationsCollection.insertOne(applicationData);
        console.log('✅ Application submitted successfully with ID:', result.insertedId);

        // 9. Update job applications count
        if (jobId && jobId !== 'N/A' && jobId !== '') {
            try {
                const jobCollection = db.collection('job');
                const { ObjectId } = require('mongodb');

                if (ObjectId.isValid(jobId)) {
                    const jobObjectId = new ObjectId(jobId);

                    await jobCollection.updateOne(
                        { _id: jobObjectId },
                        {
                            $inc: { applications: 1 },
                            $push: {
                                applicants: {
                                    userId: userId.toString(),
                                    applicationId: result.insertedId,
                                    appliedAt: new Date()
                                }
                            }
                        }
                    );
                    console.log('✅ Job applications count updated');
                }
            } catch (error) {
                console.error('⚠️ Error updating job applications count:', error);
            }
        }

        // 10. Set success message in session
        req.session.successMessage = 'Your application has been submitted successfully!';

        // 11. Redirect to job details
        if (jobId && jobId !== 'N/A' && jobId !== '') {
            return res.redirect(`/job/${jobId}`);
        } else {
            return res.redirect('/jobs?success=Application+submitted+successfully');
        }

    } catch (error) {
        console.error('❌ Error submitting application:', error);

        // Store error message in session
        req.session.errorMessage = 'An error occurred while submitting your application. Please try again.';

        // Store form data to repopulate the form
        req.session.formData = req.body;

        // Redirect back to apply form
        const jobId = req.body.jobId;
        const redirectUrl = (jobId && jobId !== 'N/A' && jobId !== '') ? `/apply?jobId=${jobId}` : '/apply';
        return res.redirect(redirectUrl);
    }
});

app.get('/login', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/dashboard');
    }
    res.render('login', { currentPage: 'login' });
});

app.get('/register', (req, res) => {
    if (req.session.isLoggedIn) {
        return res.redirect('/dashboard');
    }
    res.render('register', { currentPage: 'register' });
});

// Register functionality
app.post('/register', async (req, res) => {
    const userData = {
        email: req.body.email,
        password: req.body.password,
        confirmPassword: req.body.confirmPassword,
        fullname: req.body.fullname,
        phone: req.body.phone,
        accountType: req.body.accountType,
        company: req.body.company,
        termsAccepted: req.body.termsAccepted,
        newsletterOptIn: req.body.newsletterOptIn
    };

    try {
        const db = mongoose.connection.db;
        const collection = db.collection('users');
        const result = await collection.insertOne(userData);
        console.log('User inserted successfully:', result.insertedId);
        res.redirect('/login');
    } catch (error) {
        console.error('Registration error:', error);
        res.redirect('/register');
    }
});

// Login functionality
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const db = mongoose.connection.db;
        const collection = db.collection('users');
        const user = await collection.findOne({ email: email });

        if (!user) {
            return res.redirect('/login?error=invalid');
        }

        // Check password (in production, use bcrypt)
        if (user.password !== password) {
            return res.redirect('/login?error=invalid');
        }

        // ✅ FIX: Set the role properly
        // Check both 'role' and 'accountType' fields
        const userRole = user.role || user.accountType || 'jobseeker';

        req.session.userId = user._id;
        req.session.userName = user.fullname;
        req.session.userEmail = user.email;
        req.session.userPhone = user.phone || '';
        req.session.userRole = userRole; // ✅ Store the role
        req.session.isLoggedIn = true;

        req.session.user = {
            id: user._id,
            name: user.fullname,
            email: user.email,
            phone: user.phone || '',
            role: userRole
        };

        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
            }
            return res.redirect('/dashboard');
        });
    } catch (error) {
        console.error('Login error:', error);
        return res.redirect('/login');
    }
});

// Dashboard after login page
// In your index.js
// Dashboard - Get real data
app.get('/dashboard', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const jobCollection = db.collection('job');
        const applicationsCollection = db.collection('applications');
        const usersCollection = db.collection('users');

        const userId = req.session.userId.toString();
        const userRole = req.session.userRole || 'jobseeker';

        console.log('🔍 Fetching dashboard data for user:', userId, 'Role:', userRole);

        // Get user info
        const { ObjectId } = require('mongodb');
        const user = await usersCollection.findOne({ _id: new ObjectId(userId) });

        // Default stats
        let stats = {
            totalJobs: 0,
            activeJobs: 0,
            totalViews: 0,
            totalApplications: 0,
            pendingApplications: 0,
            shortlistedApplications: 0,
            shortlistedCount: 0,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            hiredCount: 0,
            rejectedCount: 0,
            reviewedCount: 0
        };

        let recentJobs = [];
        let recentApplications = [];

        if (userRole === 'employer') {
            // Get employer's jobs
            const userJobs = await jobCollection.find({
                user_id: userId
            }).toArray();

            const jobIds = userJobs.map(job => job._id.toString());

            // Get applications for employer's jobs
            const applications = await applicationsCollection.find({
                jobId: { $in: jobIds }
            }).toArray();

            stats.totalJobs = userJobs.length;
            stats.activeJobs = userJobs.filter(job =>
                job.status === 'active' || job.status === 'Active'
            ).length;
            stats.totalViews = userJobs.reduce((sum, job) => sum + (job.views || 0), 0);
            stats.totalApplications = applications.length;
            stats.pendingApplications = applications.filter(app => app.status === 'pending').length;
            stats.shortlistedApplications = applications.filter(app => app.status === 'shortlisted').length;
            stats.shortlistedCount = stats.shortlistedApplications;
            stats.hiredCount = applications.filter(app => app.status === 'hired').length;
            stats.rejectedCount = applications.filter(app => app.status === 'rejected').length;
            stats.reviewedCount = applications.filter(app => app.status === 'reviewed').length;

            // Recent jobs and applications
            recentJobs = userJobs
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 5);

            recentApplications = applications
                .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
                .slice(0, 5)
                .map(app => {
                    const job = userJobs.find(j => j._id.toString() === app.jobId);
                    return {
                        ...app,
                        jobTitle: job ? job.title : app.jobTitle || 'Unknown Job'
                    };
                });

        } else {
            // Job Seeker - Get user's applications
            const myApplications = await applicationsCollection.find({
                userId: userId
            }).toArray();

            stats.myApplicationsCount = myApplications.length;
            stats.shortlistedApplications = myApplications.filter(app => app.status === 'shortlisted').length;
            stats.shortlistedCount = stats.shortlistedApplications;
            stats.pendingApplications = myApplications.filter(app => app.status === 'pending').length;
            stats.hiredCount = myApplications.filter(app => app.status === 'hired').length;
            stats.rejectedCount = myApplications.filter(app => app.status === 'rejected').length;
            stats.reviewedCount = myApplications.filter(app => app.status === 'reviewed').length;
            stats.totalApplications = myApplications.length;

            // Get saved jobs (if you have a saved jobs collection)
            // const savedJobs = await savedJobsCollection.find({ userId: userId }).toArray();
            // stats.savedJobsCount = savedJobs.length;

            recentApplications = myApplications
                .sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt))
                .slice(0, 5);
        }

        // Get monthly applications data for chart
        const monthlyData = await getMonthlyApplicationsData(applicationsCollection, userId, userRole);

        res.render('afterlogin/layouts/dashboard', {
            body: 'dashboard',
            title: 'Dashboard',
            activePage: 'dashboard',
            userName: user?.fullname || req.session.userName || 'John Doe',
            userEmail: user?.email || req.session.userEmail || 'john@example.com',
            userRole: userRole,
            totalJobs: stats.totalJobs,
            activeJobs: stats.activeJobs,
            totalViews: stats.totalViews,
            totalApplications: stats.totalApplications,
            pendingApplications: stats.pendingApplications,
            shortlistedApplications: stats.shortlistedApplications,
            shortlistedCount: stats.shortlistedCount,
            myApplicationsCount: stats.myApplicationsCount,
            savedJobsCount: stats.savedJobsCount || 0,
            hiredCount: stats.hiredCount || 0,
            rejectedCount: stats.rejectedCount || 0,
            reviewedCount: stats.reviewedCount || 0,
            recentJobs: recentJobs,
            recentApplications: recentApplications,
            monthlyData: monthlyData,
            hasJobs: stats.totalJobs > 0,
            hasApplications: stats.totalApplications > 0,
            error: null
        });

    } catch (error) {
        console.error('❌ Error loading dashboard:', error);

        res.render('afterlogin/layouts/dashboard', {
            body: 'dashboard',
            title: 'Dashboard',
            activePage: 'dashboard',
            userName: req.session.userName || 'John Doe',
            userEmail: req.session.userEmail || 'john@example.com',
            userRole: req.session.userRole || 'jobseeker',
            totalJobs: 0,
            activeJobs: 0,
            totalViews: 0,
            totalApplications: 0,
            pendingApplications: 0,
            shortlistedApplications: 0,
            shortlistedCount: 0,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            hiredCount: 0,
            rejectedCount: 0,
            reviewedCount: 0,
            recentJobs: [],
            recentApplications: [],
            monthlyData: [],
            hasJobs: false,
            hasApplications: false,
            error: 'Could not load dashboard data. Please try again.'
        });
    }
});

// Helper function to get monthly applications data
async function getMonthlyApplicationsData(applicationsCollection, userId, userRole) {
    try {
        let filter = {};

        if (userRole === 'employer') {
            // For employer, get applications for their jobs
            const db = applicationsCollection.s.db;
            const jobCollection = db.collection('job');
            const userJobs = await jobCollection.find({
                user_id: userId
            }).toArray();
            const jobIds = userJobs.map(job => job._id.toString());
            filter = { jobId: { $in: jobIds } };
        } else {
            // For job seeker, get their own applications
            filter = { userId: userId };
        }

        const applications = await applicationsCollection.find(filter).toArray();

        const months = {};
        const now = new Date();

        // Initialize last 6 months
        for (let i = 5; i >= 0; i--) {
            const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = month.toLocaleString('default', { month: 'short' });
            months[key] = 0;
        }

        // Count applications by month
        applications.forEach(app => {
            const date = new Date(app.appliedAt);
            const key = date.toLocaleString('default', { month: 'short' });
            if (months[key] !== undefined) {
                months[key]++;
            }
        });

        return Object.entries(months).map(([month, count]) => ({
            month: month,
            count: count
        }));
    } catch (error) {
        console.error('Error getting monthly data:', error);
        return [];
    }
}
// Post New Job
app.get('/post-new-job', (req, res) => {
    res.render('afterlogin/layouts/dashboard', {
        body: 'cnj',  // This loads afterlogin/dashboard.ejs
        title: 'Post New Job',
        activePage: 'cnj',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        totalJobs: 12,
        activeJobs: 8,
        totalViews: 1234
    });
});
// My Jobs
app.get('/my-jobs', async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.log('❌ No userId in session. Redirecting to login.');
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const collection = db.collection('job');

        // Handle different ID types
        let userId = req.session.userId;
        if (typeof userId === 'string' && userId.length === 24) {
            userId = userId.toString();
        }
        console.log('user id is', userId);
        // Fetch jobs for this user
        const result = await collection.find({
            user_id: userId
        }).toArray();

        console.log(`✅ Found ${result.length} jobs for user ${req.session.userId}`);

        // Calculate stats
        const totalJobs = result.length;
        const activeJobs = result.filter(job =>
            job.status === 'active' || job.status === 'Active'
        ).length;
        const totalViews = result.reduce((sum, job) => sum + (job.views || 0), 0);

        // Get user info from session
        const user = req.session.user || {
            name: 'John Doe',
            email: 'john@example.com'
        };

        res.render('afterlogin/layouts/dashboard', {
            body: 'myjobs',
            title: 'My Jobs',
            activePage: 'jobs',
            userName: user.name || 'John Doe',
            userEmail: user.email || 'john@example.com',
            userRole: req.session.userRole || 'employer', // ✅ ADD THIS
            totalJobs: totalJobs,
            activeJobs: activeJobs,
            totalViews: totalViews,
            totalApplications: 0,
            pendingApplications: 0,
            shortlistedCount: 0,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            jobs: result,
            error: null
        });

    } catch (error) {
        console.error('❌ Error fetching jobs:', error);

        res.render('afterlogin/layouts/dashboard', {
            body: 'myjobs',
            title: 'My Jobs',
            activePage: 'myjobs',
            userName: 'John Doe',
            userEmail: 'john@example.com',
            totalJobs: 0,
            activeJobs: 0,
            totalViews: 0,
            jobs: [],
            error: 'Could not load your jobs. Please try again.'
        });
    }
});
// View Job Details
// View Job Details with Applicants
app.get('/admin/job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;

        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.log('❌ No userId in session. Redirecting to login.');
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const jobCollection = db.collection('job');
        const applicationsCollection = db.collection('applications');

        // Handle ObjectId
        let id = jobId;
        if (typeof jobId === 'string' && jobId.length === 24) {
            const { ObjectId } = require('mongodb');
            id = new ObjectId(jobId);
        }

        // Find the job
        const job = await jobCollection.findOne({
            _id: id
        });

        // Check if job exists
        if (!job) {
            console.log('❌ Job not found');
            return res.redirect('/my-jobs?error=Job not found');
        }

        // Check if user owns this job
        const userIdStr = req.session.userId.toString();
        const jobUserId = job.user_id ? job.user_id.toString() : '';

        if (userIdStr !== jobUserId) {
            console.log('❌ User does not own this job');
            return res.redirect('/my-jobs?error=You are not authorized to view this job');
        }

        // Fetch all applicants for this job
        const applicants = await applicationsCollection.find({
            jobId: jobId
        })
            .sort({ appliedAt: -1 })
            .toArray();

        console.log(`✅ Found ${applicants.length} applicants for job: ${job.title}`);

        // Enrich applicant data with additional info
        const enrichedApplicants = applicants.map(app => {
            const appliedDate = new Date(app.appliedAt);
            const now = new Date();
            const daysDiff = Math.floor((now - appliedDate) / (1000 * 60 * 60 * 24));

            let timeAgo = 'Today';
            if (daysDiff === 1) timeAgo = 'Yesterday';
            else if (daysDiff > 1) timeAgo = `${daysDiff} days ago`;

            let skills = app.skills || [];
            if (typeof skills === 'string') {
                skills = skills.split(',').map(s => s.trim()).filter(s => s);
            }

            return {
                ...app,
                appliedDaysAgo: timeAgo,
                appliedDateFormatted: appliedDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                }),
                appliedTimeFormatted: appliedDate.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                skills: skills
            };
        });

        // Get applicant statistics
        const applicantStats = {
            total: enrichedApplicants.length,
            pending: enrichedApplicants.filter(app => app.status === 'pending').length,
            reviewed: enrichedApplicants.filter(app => app.status === 'reviewed').length,
            shortlisted: enrichedApplicants.filter(app => app.status === 'shortlisted').length,
            rejected: enrichedApplicants.filter(app => app.status === 'rejected').length,
            hired: enrichedApplicants.filter(app => app.status === 'hired').length
        };

        // Increment views
        await jobCollection.updateOne(
            { _id: id },
            { $inc: { views: 1 } }
        );

        // Get user info from session
        const user = req.session.user || {
            name: req.session.userName || 'John Doe',
            email: req.session.userEmail || 'john@example.com'
        };

        // Get all jobs for stats
        const allJobs = await jobCollection.find({
            user_id: userIdStr
        }).toArray();

        const totalJobs = allJobs.length;
        const activeJobs = allJobs.filter(j =>
            j.status === 'active' || j.status === 'Active'
        ).length;
        const totalViews = allJobs.reduce((sum, j) => sum + (j.views || 0), 0);

        // ✅ FIX: Add userRole to the render options
        res.render('afterlogin/layouts/dashboard', {
            body: 'job-details',
            title: job.title,
            activePage: 'myjobs',
            userName: user.name || 'John Doe',
            userEmail: user.email || 'john@example.com',
            userRole: req.session.userRole || 'employer', // ✅ ADD THIS LINE
            totalJobs: totalJobs,
            activeJobs: activeJobs,
            totalViews: totalViews,
            totalApplications: enrichedApplicants.length,
            pendingApplications: applicantStats.pending,
            shortlistedCount: applicantStats.shortlisted,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            job: job,
            applicants: enrichedApplicants,
            applicantStats: applicantStats,
            error: null
        });

    } catch (error) {
        console.error('❌ Error viewing job:', error);
        res.redirect('/my-jobs?error=Could not load job details');
    }
});
// ========== UPDATE APPLICATION STATUS ==========
app.post('/applications/update-status', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        const { applicationId, status } = req.body;

        console.log('📝 Updating application status:', { applicationId, status });

        if (!applicationId || !status) {
            return res.status(400).json({
                success: false,
                message: 'Application ID and status are required'
            });
        }

        // Validate status
        const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');

        const { ObjectId } = require('mongodb');

        // Check if applicationId is valid ObjectId
        if (!ObjectId.isValid(applicationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid application ID format'
            });
        }

        const id = new ObjectId(applicationId);

        // Check if application exists and user has access
        const application = await applicationsCollection.findOne({ _id: id });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Check if the logged-in user owns the job this application is for
        const jobCollection = db.collection('job');
        const job = await jobCollection.findOne({
            _id: new ObjectId(application.jobId)
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Check if user owns this job
        const userIdStr = req.session.userId.toString();
        const jobUserId = job.user_id ? job.user_id.toString() : '';

        if (userIdStr !== jobUserId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this application'
            });
        }

        // Update the application status
        const result = await applicationsCollection.updateOne(
            { _id: id },
            {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        console.log(`✅ Application ${applicationId} status updated to: ${status}`);

        res.json({
            success: true,
            message: `Application status updated to ${status} successfully`
        });

    } catch (error) {
        console.error('❌ Error updating application status:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error: ' + error.message
        });
    }
});
app.get('/applications', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.log('❌ No userId in session. Redirecting to login.');
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');

        const userId = req.session.userId.toString();
        console.log('🔍 Fetching applications for user:', userId);

        // Get all applications for this user
        const applications = await applicationsCollection.find({
            userId: userId
        })
            .sort({ appliedAt: -1 })
            .toArray();

        console.log(`✅ Found ${applications.length} applications for user ${userId}`);

        // Get job details for each application
        const applicationsWithDetails = await Promise.all(
            applications.map(async (app) => {
                let jobDetails = null;
                let jobTitle = app.jobTitle || 'Unknown Job';
                let companyName = app.companyName || 'Unknown Company';

                if (app.jobId && app.jobId !== 'N/A' && app.jobId !== '') {
                    try {
                        const { ObjectId } = require('mongodb');
                        if (ObjectId.isValid(app.jobId)) {
                            const jobObjectId = new ObjectId(app.jobId);
                            jobDetails = await jobCollection.findOne({
                                _id: jobObjectId
                            });

                            if (jobDetails) {
                                jobTitle = jobDetails.title || jobTitle;
                                companyName = jobDetails.company || companyName;
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching job details:', error);
                    }
                }

                return {
                    ...app,
                    jobTitle: jobTitle,
                    companyName: companyName,
                    jobDetails: jobDetails
                };
            })
        );

        // Get user's jobs for stats
        const userJobs = await jobCollection.find({
            user_id: userId
        }).toArray();

        const totalJobs = userJobs.length;
        const activeJobs = userJobs.filter(job =>
            job.status === 'active' || job.status === 'Active'
        ).length;
        const totalViews = userJobs.reduce((sum, job) => sum + (job.views || 0), 0);

        // Get user info from session
        const user = req.session.user || {
            name: req.session.userName || 'John Doe',
            email: req.session.userEmail || 'john@example.com'
        };

        // Get statistics about applications
        const stats = {
            total: applicationsWithDetails.length,
            pending: applicationsWithDetails.filter(app => app.status === 'pending').length,
            reviewed: applicationsWithDetails.filter(app => app.status === 'reviewed').length,
            shortlisted: applicationsWithDetails.filter(app => app.status === 'shortlisted').length,
            rejected: applicationsWithDetails.filter(app => app.status === 'rejected').length,
            hired: applicationsWithDetails.filter(app => app.status === 'hired').length
        };

        // ✅ FIX: Add userRole to the render options
        res.render('afterlogin/layouts/dashboard', {
            body: 'applications',
            title: 'My Applications',
            activePage: 'applications',
            userName: user.name || 'John Doe',
            userEmail: user.email || 'john@example.com',
            userRole: req.session.userRole || 'jobseeker', // ✅ ADD THIS LINE
            totalJobs: totalJobs,
            activeJobs: activeJobs,
            totalViews: totalViews,
            applications: applicationsWithDetails,
            stats: stats,
            myApplicationsCount: applicationsWithDetails.length,
            shortlistedCount: stats.shortlisted,
            pendingApplications: stats.pending,
            totalApplications: stats.total,
            savedJobsCount: 0,
            error: null
        });

    } catch (error) {
        console.error('❌ Error fetching applications:', error);

        res.render('afterlogin/layouts/dashboard', {
            body: 'applications',
            title: 'My Applications',
            activePage: 'applications',
            userName: req.session.userName || 'John Doe',
            userEmail: req.session.userEmail || 'john@example.com',
            userRole: req.session.userRole || 'jobseeker', // ✅ ADD THIS LINE
            totalJobs: 0,
            activeJobs: 0,
            totalViews: 0,
            applications: [],
            stats: {
                total: 0,
                pending: 0,
                reviewed: 0,
                shortlisted: 0,
                rejected: 0,
                hired: 0
            },
            myApplicationsCount: 0,
            shortlistedCount: 0,
            pendingApplications: 0,
            totalApplications: 0,
            savedJobsCount: 0,
            error: 'Could not load applications. Please try again later.'
        });
    }
});
// Edit Job - Show Form
// Edit Job - Show Form
app.get('/edit-job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;

        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.log('❌ No userId in session. Redirecting to login.');
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const collection = db.collection('job');

        // Handle ObjectId
        let id = jobId;
        if (typeof jobId === 'string' && jobId.length === 24) {
            const { ObjectId } = require('mongodb');
            id = new ObjectId(jobId);
        }

        // Find the job
        const job = await collection.findOne({
            _id: id
        });

        // Check if job exists
        if (!job) {
            console.log('❌ Job not found');
            return res.redirect('/my-jobs?error=Job not found');
        }

        // Check if user owns this job
        const userIdStr = req.session.userId.toString();
        const jobUserId = job.user_id ? job.user_id.toString() : '';

        if (userIdStr !== jobUserId) {
            console.log('❌ User does not own this job');
            return res.redirect('/my-jobs?error=You are not authorized to edit this job');
        }

        // Get user info from session
        const user = req.session.user || {
            name: 'John Doe',
            email: 'john@example.com'
        };

        // Get all jobs for stats
        const allJobs = await collection.find({
            user_id: userIdStr
        }).toArray();

        const totalJobs = allJobs.length;
        const activeJobs = allJobs.filter(j =>
            j.status === 'active' || j.status === 'Active'
        ).length;
        const totalViews = allJobs.reduce((sum, j) => sum + (j.views || 0), 0);

        // Convert arrays to strings for form fields
        if (Array.isArray(job.skills)) {
            job.skills = job.skills.join(', ');
        }
        if (Array.isArray(job.requirements)) {
            job.requirements = job.requirements.join('\n');
        }
        if (Array.isArray(job.benefits)) {
            job.benefits = job.benefits.join('\n');
        }

        // ✅ Pass query parameters to the view
        const success = req.query.success || null;
        const error = req.query.error || null;

        res.render('afterlogin/layouts/dashboard', {
            body: 'edit-job',
            title: 'Edit Job',
            activePage: 'myjobs',
            userName: user.name || 'John Doe',
            userEmail: user.email || 'john@example.com',
            totalJobs: totalJobs,
            activeJobs: activeJobs,
            totalViews: totalViews,
            job: job,
            errors: null,
            isEdit: true,
            success: success,  // ✅ Pass success message
            error: error       // ✅ Pass error message
        });

    } catch (error) {
        console.error('❌ Error loading edit job:', error);
        res.redirect('/my-jobs?error=Could not load job for editing');
    }
});
// Update Job - Save Changes
app.post('/update-job/:id', async (req, res) => {
    try {
        const jobId = req.params.id;

        // Check if user is logged in
        if (!req.session || !req.session.userId) {
            console.log('❌ No userId in session. Redirecting to login.');
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const collection = db.collection('job');

        // Handle ObjectId
        let id = jobId;
        if (typeof jobId === 'string' && jobId.length === 24) {
            const { ObjectId } = require('mongodb');
            id = new ObjectId(jobId);
        }

        // Extract form data
        const {
            title,
            type,
            location,
            salary,
            skills,
            description,
            requirements,
            vacancies,
            experience,
            status,
            benefits
        } = req.body;

        // Validation
        const errors = [];

        if (!title || title.trim().length < 3) {
            errors.push('Job title is required and must be at least 3 characters');
        }
        if (!type) errors.push('Please select a job type');
        if (!location || location.trim().length < 2) errors.push('Location is required');
        if (!skills || skills.trim().length < 2) errors.push('Please enter at least one skill');
        if (!description || description.trim().length < 20) {
            errors.push('Job description must be at least 20 characters');
        }
        if (!requirements || requirements.trim().length < 10) {
            errors.push('Job requirements must be at least 10 characters');
        }
        if (!vacancies || parseInt(vacancies) < 1) {
            errors.push('Number of vacancies must be at least 1');
        }
        if (!experience) errors.push('Please select required experience level');

        if (errors.length > 0) {
            const user = req.session?.user || {
                name: 'John Doe',
                email: 'john@example.com'
            };

            const job = req.body;
            job._id = jobId;

            const allJobs = await collection.find({
                user_id: req.session.userId.toString()
            }).toArray();

            return res.render('afterlogin/layouts/dashboard', {
                body: 'edit-job',
                title: 'Edit Job',
                activePage: 'myjobs',
                userName: user.name || 'John Doe',
                userEmail: user.email || 'john@example.com',
                totalJobs: allJobs.length,
                activeJobs: allJobs.filter(j => j.status === 'active').length,
                totalViews: allJobs.reduce((sum, j) => sum + (j.views || 0), 0),
                job: job,
                errors: errors,
                isEdit: true
            });
        }

        // Process skills and requirements
        const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);
        const requirementsArray = requirements.split('\n').filter(r => r.trim());
        const benefitsArray = benefits ? benefits.split('\n').filter(b => b.trim()) : [];

        // Update job
        const result = await collection.updateOne(
            {
                _id: id,
                user_id: req.session.userId.toString()
            },
            {
                $set: {
                    title: title.trim(),
                    type: type,
                    location: location.trim(),
                    salary: salary ? salary.trim() : 'Negotiable',
                    skills: skillsArray,
                    description: description.trim(),
                    requirements: requirementsArray,
                    vacancies: parseInt(vacancies),
                    experience: experience,
                    status: status || 'active',
                    benefits: benefitsArray,
                    updatedAt: new Date(),
                    isActive: status === 'active' ? true : false
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.redirect('/my-jobs?error=Job not found or you are not authorized');
        }

        console.log('✅ Job updated successfully:', jobId);

        req.session.success = 'Job updated successfully!';
        res.redirect(`/job/${jobId}?success=Job updated successfully`);

    } catch (error) {
        console.error('❌ Error updating job:', error);
        res.redirect(`/edit-job/${req.params.id}?error=Could not update job`);
    }
});
// shortlist
app.get('/short-list', (req, res) => {
    res.render('afterlogin/layouts/dashboard', {
        body: 'shortlisted',  // This loads afterlogin/dashboard.ejs
        title: 'Shortlist',
        activePage: 'shortlisted',
        userName: 'John Doe',
        userEmail: 'john@example.com',
        totalJobs: 12,
        activeJobs: 8,
        totalViews: 1234
    });
});
// settings
// Settings Route
app.get('/settings', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/login');
        }

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        const jobCollection = db.collection('job');

        const userId = req.session.userId.toString();

        // Get user data from database
        const user = await usersCollection.findOne({
            _id: new require('mongodb').ObjectId(userId)
        });

        if (!user) {
            return res.redirect('/logout');
        }

        // Get user's jobs for stats
        const userJobs = await jobCollection.find({
            user_id: userId
        }).toArray();

        const totalJobs = userJobs.length;
        const activeJobs = userJobs.filter(job =>
            job.status === 'active' || job.status === 'Active'
        ).length;
        const totalViews = userJobs.reduce((sum, job) => sum + (job.views || 0), 0);

        res.render('afterlogin/layouts/dashboard', {
            body: 'settings',
            title: 'Settings',
            activePage: 'settings',
            userName: user.fullname || req.session.userName || 'John Doe',
            userEmail: user.email || req.session.userEmail || 'john@example.com',
            userRole: req.session.userRole || 'jobseeker',
            totalJobs: totalJobs,
            activeJobs: activeJobs,
            totalViews: totalViews,
            totalApplications: 0,
            pendingApplications: 0,
            shortlistedCount: 0,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            user: user,
            error: null,
            success: null
        });

    } catch (error) {
        console.error('❌ Error loading settings:', error);
        res.render('afterlogin/layouts/dashboard', {
            body: 'settings',
            title: 'Settings',
            activePage: 'settings',
            userName: req.session.userName || 'John Doe',
            userEmail: req.session.userEmail || 'john@example.com',
            userRole: req.session.userRole || 'jobseeker',
            totalJobs: 0,
            activeJobs: 0,
            totalViews: 0,
            totalApplications: 0,
            pendingApplications: 0,
            shortlistedCount: 0,
            myApplicationsCount: 0,
            savedJobsCount: 0,
            user: null,
            error: 'Could not load settings. Please try again.',
            success: null
        });
    }
});

// Update Profile
app.post('/settings/update-profile', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/login');
        }

        const { fullname, phone, company, bio, location, website } = req.body;
        const userId = req.session.userId.toString();

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Update user profile
        await usersCollection.updateOne(
            { _id: new require('mongodb').ObjectId(userId) },
            {
                $set: {
                    fullname: fullname,
                    phone: phone || '',
                    company: company || '',
                    bio: bio || '',
                    location: location || '',
                    website: website || '',
                    updatedAt: new Date()
                }
            }
        );

        // Update session
        req.session.userName = fullname;
        req.session.userPhone = phone || '';

        req.session.successMessage = 'Profile updated successfully!';
        res.redirect('/settings?success=Profile+updated+successfully');

    } catch (error) {
        console.error('❌ Error updating profile:', error);
        req.session.errorMessage = 'Could not update profile. Please try again.';
        res.redirect('/settings?error=Could+not+update+profile');
    }
});

// Change Password
app.post('/settings/change-password', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/login');
        }

        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.session.userId.toString();

        // Validation
        if (!currentPassword || !newPassword || !confirmPassword) {
            req.session.errorMessage = 'All password fields are required';
            return res.redirect('/settings?error=All+password+fields+are+required');
        }

        if (newPassword.length < 6) {
            req.session.errorMessage = 'New password must be at least 6 characters';
            return res.redirect('/settings?error=New+password+must+be+at+least+6+characters');
        }

        if (newPassword !== confirmPassword) {
            req.session.errorMessage = 'Passwords do not match';
            return res.redirect('/settings?error=Passwords+do+not+match');
        }

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        // Get user
        const user = await usersCollection.findOne({
            _id: new require('mongodb').ObjectId(userId)
        });

        if (!user) {
            req.session.errorMessage = 'User not found';
            return res.redirect('/settings?error=User+not+found');
        }

        // Check current password (in production, use bcrypt)
        if (user.password !== currentPassword) {
            req.session.errorMessage = 'Current password is incorrect';
            return res.redirect('/settings?error=Current+password+is+incorrect');
        }

        // Update password (in production, hash the password)
        await usersCollection.updateOne(
            { _id: new require('mongodb').ObjectId(userId) },
            {
                $set: {
                    password: newPassword,
                    updatedAt: new Date()
                }
            }
        );

        req.session.successMessage = 'Password changed successfully!';
        res.redirect('/settings?success=Password+changed+successfully');

    } catch (error) {
        console.error('❌ Error changing password:', error);
        req.session.errorMessage = 'Could not change password. Please try again.';
        res.redirect('/settings?error=Could+not+change+password');
    }
});

// Delete Account
app.post('/settings/delete-account', authMiddleware.isAuthenticated, async (req, res) => {
    try {
        if (!req.session || !req.session.userId) {
            return res.redirect('/login');
        }

        const { confirmDelete } = req.body;
        const userId = req.session.userId.toString();

        if (confirmDelete !== 'DELETE') {
            req.session.errorMessage = 'Please type DELETE to confirm';
            return res.redirect('/settings?error=Please+type+DELETE+to+confirm');
        }

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        const jobCollection = db.collection('job');
        const applicationsCollection = db.collection('applications');

        // Delete user's jobs
        await jobCollection.deleteMany({ user_id: userId });

        // Delete user's applications
        await applicationsCollection.deleteMany({ userId: userId });

        // Delete user
        await usersCollection.deleteOne({
            _id: new require('mongodb').ObjectId(userId)
        });

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Session destroy error:', err);
            }
            res.redirect('/login?success=Account+deleted+successfully');
        });

    } catch (error) {
        console.error('❌ Error deleting account:', error);
        req.session.errorMessage = 'Could not delete account. Please try again.';
        res.redirect('/settings?error=Could+not+delete+account');
    }
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/login');
    });
});
// Terms and Conditions Route
app.get('/terms', (req, res) => {
    res.render('terms', {
        currentPage: 'terms',
        title: 'Terms and Conditions - JobHub'
    });
});
// Privacy Policy Route
app.get('/privacy', (req, res) => {
    res.render('privacypolicies', {
        currentPage: 'privacy',
        title: 'Privacy Policy - JobHub'
    });
});
app.get('/faq', (req, res) => {
    res.render('faq', {
        currentPage: 'faq',
        title: 'FAQ - JobHub'
    });
});
// ============================================
// ========== RESTful API ROUTES ==========
// ============================================

// ========== API MIDDLEWARE ==========
// API Authentication Middleware
const apiAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'No token provided'
            });
        }

        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');

        const user = await usersCollection.findOne({ sessionToken: token });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        req.userId = user._id.toString();
        req.userRole = user.role || user.accountType || 'jobseeker';
        req.user = user;
        next();
    } catch (error) {
        console.error('API Auth error:', error);
        return res.status(500).json({
            success: false,
            message: 'Authentication error'
        });
    }
};

// ============================================
// ========== PUBLIC API ROUTES ==========
// ============================================

// ========== 1. GET ALL JOBS ==========
app.get('/api/jobs', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const filter = { status: 'active' };

        if (req.query.search) {
            filter.$or = [
                { title: { $regex: req.query.search, $options: 'i' } },
                { description: { $regex: req.query.search, $options: 'i' } },
                { company: { $regex: req.query.search, $options: 'i' } }
            ];
        }

        if (req.query.type) {
            filter.type = req.query.type;
        }

        if (req.query.location) {
            filter.location = { $regex: req.query.location, $options: 'i' };
        }

        const jobs = await collection.find(filter)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const total = await collection.countDocuments(filter);

        res.json({
            success: true,
            data: jobs,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('API Error fetching jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching jobs'
        });
    }
});

// ========== 2. GET SINGLE JOB ==========
app.get('/api/jobs/:id', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const jobId = req.params.id;
        let id = jobId;

        if (typeof jobId === 'string' && jobId.length === 24) {
            id = new ObjectId(jobId);
        }

        const job = await collection.findOne({
            _id: id,
            status: 'active'
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        // Increment views
        await collection.updateOne(
            { _id: id },
            { $inc: { views: 1 } }
        );

        res.json({
            success: true,
            data: job
        });
    } catch (error) {
        console.error('API Error fetching job:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching job'
        });
    }
});

// ========== 3. GET JOB CATEGORIES ==========
app.get('/api/categories', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        const categories = await collection.distinct('type');

        res.json({
            success: true,
            data: categories
        });
    } catch (error) {
        console.error('API Error fetching categories:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching categories'
        });
    }
});

// ========== 4. GET JOB STATISTICS ==========
app.get('/api/stats', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const jobCollection = db.collection('job');
        const userCollection = db.collection('users');
        const appCollection = db.collection('applications');

        const totalJobs = await jobCollection.countDocuments({ status: 'active' });
        const totalCompanies = await jobCollection.distinct('company');
        const totalUsers = await userCollection.countDocuments();
        const totalApplications = await appCollection.countDocuments();

        res.json({
            success: true,
            data: {
                totalJobs,
                totalCompanies: totalCompanies.length,
                totalUsers,
                totalApplications
            }
        });
    } catch (error) {
        console.error('API Error fetching stats:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics'
        });
    }
});

// ========== 5. GET FEATURED JOBS ==========
app.get('/api/jobs/featured', async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        const featuredJobs = await collection.find({ status: 'active' })
            .sort({ views: -1 })
            .limit(6)
            .toArray();

        res.json({
            success: true,
            data: featuredJobs
        });
    } catch (error) {
        console.error('API Error fetching featured jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching featured jobs'
        });
    }
});

// ============================================
// ========== AUTH API ROUTES ==========
// ============================================

// ========== 6. REGISTER ==========
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password, fullname, phone, accountType, company } = req.body;

        if (!email || !password || !fullname) {
            return res.status(400).json({
                success: false,
                message: 'Email, password, and full name are required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        const existingUser = await collection.findOne({ email });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'User already exists with this email'
            });
        }

        const userData = {
            email,
            password,
            fullname,
            phone: phone || '',
            accountType: accountType || 'jobseeker',
            role: accountType || 'jobseeker',
            company: company || '',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await collection.insertOne(userData);

        const token = Buffer.from(`${result.insertedId}-${Date.now()}`).toString('base64');

        await collection.updateOne(
            { _id: result.insertedId },
            { $set: { sessionToken: token } }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: {
                userId: result.insertedId,
                token,
                user: {
                    id: result.insertedId,
                    email,
                    fullname,
                    role: userData.role
                }
            }
        });
    } catch (error) {
        console.error('API Registration error:', error);
        res.status(500).json({
            success: false,
            message: 'Registration failed'
        });
    }
});

// ========== 7. LOGIN ==========
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        const user = await collection.findOne({ email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        if (user.password !== password) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const token = Buffer.from(`${user._id}-${Date.now()}`).toString('base64');

        await collection.updateOne(
            { _id: user._id },
            { $set: { sessionToken: token, lastLogin: new Date() } }
        );

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user._id,
                    email: user.email,
                    fullname: user.fullname,
                    phone: user.phone || '',
                    role: user.role || user.accountType || 'jobseeker',
                    company: user.company || ''
                }
            }
        });
    } catch (error) {
        console.error('API Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

// ========== 8. LOGOUT ==========
app.post('/api/auth/logout', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('users');
        const { ObjectId } = require('mongodb');

        await collection.updateOne(
            { _id: new ObjectId(req.userId) },
            { $unset: { sessionToken: "" } }
        );

        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('API Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Logout failed'
        });
    }
});

// ========== 9. GET USER PROFILE ==========
app.get('/api/auth/profile', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('users');
        const { ObjectId } = require('mongodb');

        const user = await collection.findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { password: 0, sessionToken: 0 } }
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('API Error fetching profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching profile'
        });
    }
});

// ========== 10. UPDATE USER PROFILE ==========
app.put('/api/auth/profile', apiAuth, async (req, res) => {
    try {
        const { fullname, phone, company, bio, location, website } = req.body;
        const { ObjectId } = require('mongodb');
        const db = mongoose.connection.db;
        const collection = db.collection('users');

        const updateData = {
            fullname: fullname || req.user.fullname,
            phone: phone || '',
            company: company || '',
            bio: bio || '',
            location: location || '',
            website: website || '',
            updatedAt: new Date()
        };

        await collection.updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: updateData }
        );

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: updateData
        });
    } catch (error) {
        console.error('API Error updating profile:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating profile'
        });
    }
});

// ========== 11. CHANGE PASSWORD ==========
app.put('/api/auth/password', apiAuth, async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const { ObjectId } = require('mongodb');

        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All password fields are required'
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match'
            });
        }

        const db = mongoose.connection.db;
        const collection = db.collection('users');

        const user = await collection.findOne({ _id: new ObjectId(req.userId) });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.password !== currentPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        await collection.updateOne(
            { _id: new ObjectId(req.userId) },
            { $set: { password: newPassword, updatedAt: new Date() } }
        );

        res.json({
            success: true,
            message: 'Password changed successfully'
        });
    } catch (error) {
        console.error('API Error changing password:', error);
        res.status(500).json({
            success: false,
            message: 'Error changing password'
        });
    }
});

// ============================================
// ========== JOB SEEKER API ROUTES ==========
// ============================================

// ========== 12. APPLY FOR JOB ==========
app.post('/api/applications', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const { jobId, fullName, email, phone, location, education, experience, skills, coverLetter } = req.body;

        if (!jobId) {
            return res.status(400).json({
                success: false,
                message: 'Job ID is required'
            });
        }

        const job = await jobCollection.findOne({
            _id: new ObjectId(jobId),
            status: 'active'
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found or not active'
            });
        }

        const existingApplication = await applicationsCollection.findOne({
            jobId: jobId,
            userId: req.userId
        });

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: 'You have already applied for this job'
            });
        }

        const applicationData = {
            jobId,
            jobTitle: job.title,
            companyName: job.company || 'Company',
            userId: req.userId,
            userEmail: req.user.email,
            userName: req.user.fullname,
            fullName: fullName || req.user.fullname,
            email: email || req.user.email,
            phone: phone || '',
            location: location || '',
            education: education || '',
            experience: experience || '',
            skills: skills ? skills.split(',').map(s => s.trim()) : [],
            coverLetter: coverLetter || '',
            status: 'pending',
            appliedAt: new Date(),
            updatedAt: new Date(),
            isActive: true
        };

        const result = await applicationsCollection.insertOne(applicationData);

        await jobCollection.updateOne(
            { _id: new ObjectId(jobId) },
            {
                $inc: { applications: 1 },
                $push: {
                    applicants: {
                        userId: req.userId,
                        applicationId: result.insertedId,
                        appliedAt: new Date()
                    }
                }
            }
        );

        res.status(201).json({
            success: true,
            message: 'Application submitted successfully',
            data: {
                applicationId: result.insertedId,
                status: 'pending'
            }
        });
    } catch (error) {
        console.error('API Error submitting application:', error);
        res.status(500).json({
            success: false,
            message: 'Error submitting application'
        });
    }
});

// ========== 13. GET MY APPLICATIONS ==========
app.get('/api/applications/my', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const applications = await applicationsCollection.find({
            userId: req.userId
        })
            .sort({ appliedAt: -1 })
            .toArray();

        const applicationsWithDetails = await Promise.all(
            applications.map(async (app) => {
                let jobTitle = app.jobTitle || 'Unknown Job';
                let companyName = app.companyName || 'Unknown Company';

                if (app.jobId && app.jobId !== 'N/A') {
                    try {
                        if (ObjectId.isValid(app.jobId)) {
                            const job = await jobCollection.findOne({
                                _id: new ObjectId(app.jobId)
                            });
                            if (job) {
                                jobTitle = job.title || jobTitle;
                                companyName = job.company || companyName;
                            }
                        }
                    } catch (error) {
                        console.error('Error fetching job details:', error);
                    }
                }

                return {
                    ...app,
                    jobTitle,
                    companyName
                };
            })
        );

        res.json({
            success: true,
            data: applicationsWithDetails
        });
    } catch (error) {
        console.error('API Error fetching applications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching applications'
        });
    }
});

// ========== 14. WITHDRAW APPLICATION ==========
app.delete('/api/applications/:id', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const applicationId = req.params.id;

        const application = await applicationsCollection.findOne({
            _id: new ObjectId(applicationId),
            userId: req.userId
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        if (application.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending applications can be withdrawn'
            });
        }

        await applicationsCollection.deleteOne({
            _id: new ObjectId(applicationId)
        });

        if (application.jobId && application.jobId !== 'N/A') {
            await jobCollection.updateOne(
                { _id: new ObjectId(application.jobId) },
                { $inc: { applications: -1 } }
            );
        }

        res.json({
            success: true,
            message: 'Application withdrawn successfully'
        });
    } catch (error) {
        console.error('API Error withdrawing application:', error);
        res.status(500).json({
            success: false,
            message: 'Error withdrawing application'
        });
    }
});

// ============================================
// ========== EMPLOYER API ROUTES ==========
// ============================================

// ========== 15. CREATE JOB ==========
app.post('/api/jobs', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');
        const { ObjectId } = require('mongodb');

        if (req.userRole !== 'employer') {
            return res.status(403).json({
                success: false,
                message: 'Only employers can create jobs'
            });
        }

        const { title, type, location, salary, skills, description, requirements, vacancies, experience, status, benefits } = req.body;

        // Validation
        const errors = [];
        if (!title || title.length < 3) errors.push('Title is required (min 3 chars)');
        if (!type) errors.push('Job type is required');
        if (!location) errors.push('Location is required');
        if (!skills) errors.push('Skills are required');
        if (!description || description.length < 20) errors.push('Description must be at least 20 chars');
        if (!requirements || requirements.length < 10) errors.push('Requirements must be at least 10 chars');

        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        const skillsArray = skills.split(',').map(s => s.trim()).filter(s => s);
        const requirementsArray = requirements.split('\n').filter(r => r.trim());
        const benefitsArray = benefits ? benefits.split('\n').filter(b => b.trim()) : [];

        const jobData = {
            user_id: req.userId,
            title: title.trim(),
            type,
            location: location.trim(),
            salary: salary || 'Negotiable',
            skills: skillsArray,
            description: description.trim(),
            requirements: requirementsArray,
            vacancies: parseInt(vacancies) || 1,
            experience: experience || 'Any Level',
            status: status || 'active',
            benefits: benefitsArray,
            views: 0,
            applications: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: status === 'active' ? true : false,
            company: req.user.company || 'Company'
        };

        const result = await collection.insertOne(jobData);

        res.status(201).json({
            success: true,
            message: 'Job created successfully',
            data: {
                jobId: result.insertedId,
                ...jobData
            }
        });
    } catch (error) {
        console.error('API Error creating job:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating job'
        });
    }
});

// ========== 16. GET MY JOBS (Employer) ==========
app.get('/api/jobs/my', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');

        if (req.userRole !== 'employer') {
            return res.status(403).json({
                success: false,
                message: 'Only employers can view their jobs'
            });
        }

        const jobs = await collection.find({
            user_id: req.userId
        })
            .sort({ createdAt: -1 })
            .toArray();

        res.json({
            success: true,
            data: jobs
        });
    } catch (error) {
        console.error('API Error fetching my jobs:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching jobs'
        });
    }
});

// ========== 17. UPDATE JOB ==========
app.put('/api/jobs/:id', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const jobId = req.params.id;

        const job = await collection.findOne({
            _id: new ObjectId(jobId)
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (job.user_id !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this job'
            });
        }

        const { title, type, location, salary, skills, description, requirements, vacancies, experience, status, benefits } = req.body;

        const updateData = {};
        if (title) updateData.title = title.trim();
        if (type) updateData.type = type;
        if (location) updateData.location = location.trim();
        if (salary) updateData.salary = salary;
        if (skills) updateData.skills = skills.split(',').map(s => s.trim()).filter(s => s);
        if (description) updateData.description = description.trim();
        if (requirements) updateData.requirements = requirements.split('\n').filter(r => r.trim());
        if (vacancies) updateData.vacancies = parseInt(vacancies);
        if (experience) updateData.experience = experience;
        if (status) {
            updateData.status = status;
            updateData.isActive = status === 'active';
        }
        if (benefits) updateData.benefits = benefits.split('\n').filter(b => b.trim());

        updateData.updatedAt = new Date();

        await collection.updateOne(
            { _id: new ObjectId(jobId) },
            { $set: updateData }
        );

        res.json({
            success: true,
            message: 'Job updated successfully'
        });
    } catch (error) {
        console.error('API Error updating job:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating job'
        });
    }
});

// ========== 18. DELETE JOB ==========
app.delete('/api/jobs/:id', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const collection = db.collection('job');
        const applicationsCollection = db.collection('applications');
        const { ObjectId } = require('mongodb');

        const jobId = req.params.id;

        const job = await collection.findOne({
            _id: new ObjectId(jobId)
        });

        if (!job) {
            return res.status(404).json({
                success: false,
                message: 'Job not found'
            });
        }

        if (job.user_id !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to delete this job'
            });
        }

        await collection.deleteOne({ _id: new ObjectId(jobId) });

        // Also delete associated applications
        await applicationsCollection.deleteMany({ jobId: jobId });

        res.json({
            success: true,
            message: 'Job deleted successfully'
        });
    } catch (error) {
        console.error('API Error deleting job:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting job'
        });
    }
});

// ========== 19. GET APPLICATIONS FOR MY JOBS ==========
app.get('/api/applications/my-jobs', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');
        const { ObjectId } = require('mongodb');

        if (req.userRole !== 'employer') {
            return res.status(403).json({
                success: false,
                message: 'Only employers can view applications'
            });
        }

        const userJobs = await jobCollection.find({
            user_id: req.userId
        }).toArray();

        const jobIds = userJobs.map(job => job._id.toString());

        const applications = await applicationsCollection.find({
            jobId: { $in: jobIds }
        })
            .sort({ appliedAt: -1 })
            .toArray();

        const applicationsWithDetails = await Promise.all(
            applications.map(async (app) => {
                const job = userJobs.find(j => j._id.toString() === app.jobId);
                return {
                    ...app,
                    jobTitle: job ? job.title : app.jobTitle || 'Unknown Job',
                    companyName: job ? job.company : app.companyName || 'Unknown Company'
                };
            })
        );

        res.json({
            success: true,
            data: applicationsWithDetails
        });
    } catch (error) {
        console.error('API Error fetching applications:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching applications'
        });
    }
});

// ========== 20. UPDATE APPLICATION STATUS ==========
app.put('/api/applications/:id/status', apiAuth, async (req, res) => {
    try {
        const db = mongoose.connection.db;
        const applicationsCollection = db.collection('applications');
        const jobCollection = db.collection('job');
        const { ObjectId } = require('mongodb');

        const applicationId = req.params.id;
        const { status } = req.body;

        const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status value'
            });
        }

        const application = await applicationsCollection.findOne({
            _id: new ObjectId(applicationId)
        });

        if (!application) {
            return res.status(404).json({
                success: false,
                message: 'Application not found'
            });
        }

        // Check if user owns the job
        const job = await jobCollection.findOne({
            _id: new ObjectId(application.jobId)
        });

        if (!job || job.user_id !== req.userId) {
            return res.status(403).json({
                success: false,
                message: 'You are not authorized to update this application'
            });
        }

        await applicationsCollection.updateOne(
            { _id: new ObjectId(applicationId) },
            {
                $set: {
                    status: status,
                    updatedAt: new Date()
                }
            }
        );

        res.json({
            success: true,
            message: `Application status updated to ${status}`,
            data: { status }
        });
    } catch (error) {
        console.error('API Error updating application status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating application status'
        });
    }
});

// ============================================
// ========== API DOCUMENTATION ==========
// ============================================

app.get('/api/docs', (req, res) => {
    res.json({
        name: 'JobHub REST API',
        version: '1.0.0',
        base_url: '/api',
        endpoints: {
            public: {
                'GET /api/jobs': 'Get all jobs (with pagination)',
                'GET /api/jobs/:id': 'Get single job',
                'GET /api/jobs/featured': 'Get featured jobs',
                'GET /api/categories': 'Get job categories',
                'GET /api/stats': 'Get platform statistics',
                'POST /api/auth/register': 'Register new user',
                'POST /api/auth/login': 'Login user'
            },
            authenticated: {
                'GET /api/auth/profile': 'Get user profile',
                'PUT /api/auth/profile': 'Update user profile',
                'PUT /api/auth/password': 'Change password',
                'POST /api/auth/logout': 'Logout user',
                'POST /api/applications': 'Apply for job',
                'GET /api/applications/my': 'Get my applications',
                'DELETE /api/applications/:id': 'Withdraw application',
                'POST /api/jobs': 'Create job (Employer only)',
                'GET /api/jobs/my': 'Get my jobs (Employer only)',
                'PUT /api/jobs/:id': 'Update job (Employer only)',
                'DELETE /api/jobs/:id': 'Delete job (Employer only)',
                'GET /api/applications/my-jobs': 'Get applications for my jobs (Employer only)',
                'PUT /api/applications/:id/status': 'Update application status (Employer only)'
            }
        },
        authentication: {
            type: 'Bearer Token',
            header: 'Authorization: Bearer {token}'
        }
    });
});
// API Documentation Page Route
app.get('/api-docs', (req, res) => {
    res.render('api', {
        currentPage: 'api',
        title: 'API Documentation - JobHub'
    });
});

app.listen(3000, () => {
    console.log('App is running on 3000 port');
});